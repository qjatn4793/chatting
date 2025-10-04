package com.realtime.chatting.friend.service;

import com.realtime.chatting.friend.dto.FriendRequestDto;
import com.realtime.chatting.friend.entity.FriendRequest;
import com.realtime.chatting.friend.model.FriendRequestStatus;
import com.realtime.chatting.friend.repository.FriendRequestRepository;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class FriendService {

    private final FriendRequestRepository requestRepo;
    private final UserRepository userRepo;
    private final SimpMessagingTemplate messaging;

    private FriendRequestDto toDto(FriendRequest fr) {
        return new FriendRequestDto(
                fr.getId(),
                fr.getRequester().getEmail(),
                fr.getReceiver().getEmail(),
                fr.getStatus(),
                fr.getCreatedAt()
        );
    }

    /* ========== 유틸: identifier 판별/정규화 ========== */

    private static final Pattern EMAIL_RE  = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern DIGITS_RE = Pattern.compile("^\\+?\\d{7,15}$");

    private boolean isEmail(String s)     { return s != null && EMAIL_RE.matcher(s).matches(); }
    private boolean isPhoneLike(String s) { return s != null && DIGITS_RE.matcher(s).matches(); }

    /** 휴대폰을 E.164 형태로 정규화(팀 규칙에 맞게 조정) */
    private String normalizePhone(String raw) {
        if (raw == null) return null;
        String s = raw.trim().replaceAll("[^\\d+]", "");
        if (!s.startsWith("+")) {
            // 한국 가정
            if (s.startsWith("0")) s = s.substring(1);
            s = "+82" + s;
        }
        return s;
    }

    public Optional<User> findUserByFlexibleIdentifier(String identifier) {
        return findUserByIdentifier(identifier);
    }

    private Optional<User> findUserByIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) return Optional.empty();
        String idf = identifier.trim();

        if (isEmail(idf)) {
            return userRepo.findByEmailCi(idf);
        }
        if (isPhoneLike(idf)) {
            return userRepo.findByPhoneNumber(normalizePhone(idf));
        }
        // 그 외는 username으로 취급
        return userRepo.findByUsername(idf);
    }

    /* ========== UUID → User ========= */

    private User requireUser(UUID id) {
        return userRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 유효하지 않습니다."));
    }

    /* ========== 공개 API: flexible 요청 ========= */

    @Transactional
    public FriendRequestDto sendRequestFlexible(UUID myUserId, String identifier) {
        User me     = requireUser(myUserId);
        User target = findUserByIdentifier(identifier)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "상대를 찾을 수 없습니다."));

        if (Objects.equals(me.getId(), target.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자기 자신에게는 보낼 수 없습니다.");
        }
        return sendRequest(me.getEmail(), target.getEmail()); // 이메일 기반 공통로직 재사용
    }

    /* ========== UUID 기반 편의 API ========== */

    @Transactional(readOnly = true)
    public List<FriendRequestDto> incomingPendingByUserId(UUID myUserId) {
        return incomingPending(requireUser(myUserId).getEmail());
    }

    @Transactional(readOnly = true)
    public List<FriendRequestDto> outgoingPendingByUserId(UUID myUserId) {
        return outgoingPending(requireUser(myUserId).getEmail());
    }

    @Transactional
    public FriendRequestDto sendRequestByUserId(UUID myUserId, UUID targetUserId) {
        User me = requireUser(myUserId);
        User tg = requireUser(targetUserId);
        return sendRequest(me.getEmail(), tg.getEmail());
    }

    @Transactional
    public FriendRequestDto acceptByUserId(Long id, UUID myUserId) {
        return accept(id, requireUser(myUserId).getEmail());
    }

    @Transactional
    public FriendRequestDto declineByUserId(Long id, UUID myUserId) {
        return decline(id, requireUser(myUserId).getEmail());
    }

    @Transactional
    public void cancelByUserId(Long id, UUID myUserId) {
        cancel(id, requireUser(myUserId).getEmail());
    }

    /** ✅ 프론트 요구대로: 이메일 리스트 반환 */
    @Transactional(readOnly = true)
    public List<String> myFriendsByUserId(UUID myUserId) {
        User me = requireUser(myUserId);
        return myFriends(me.getEmail());
    }

    /** UUID 기반 친구 여부 체크 */
    @Transactional(readOnly = true)
    public boolean areFriendsByUserId(UUID myUserId, UUID otherUserId) {
        User me    = requireUser(myUserId);
        User other = requireUser(otherUserId);
        return areFriendsByEmail(me.getEmail(), other.getEmail());
    }

    /* ===== email 기반 내부 로직 ===== */

    @Transactional(readOnly = true)
    public List<FriendRequestDto> incomingPending(String myEmail) {
        return requestRepo.findByReceiver_EmailAndStatus(myEmail, FriendRequestStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<FriendRequestDto> outgoingPending(String myEmail) {
        return requestRepo.findByRequester_EmailAndStatus(myEmail, FriendRequestStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public FriendRequestDto sendRequest(String myEmail, String targetEmail) {
        if (Objects.equals(myEmail, targetEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "자기 자신에게는 보낼 수 없습니다.");
        }

        User meU = userRepo.findByEmailCi(myEmail).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "인증이 유효하지 않습니다."));
        User tgU = userRepo.findByEmailCi(targetEmail).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "존재하지 않는 사용자입니다."));

        requestRepo.findByRequester_EmailAndReceiver_EmailAndStatusIn(
                myEmail, targetEmail, List.of(FriendRequestStatus.PENDING, FriendRequestStatus.ACCEPTED)
        ).ifPresent(x -> { throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 요청했거나 친구입니다."); });

        requestRepo.findByRequester_EmailAndReceiver_EmailAndStatusIn(
                targetEmail, myEmail, List.of(FriendRequestStatus.PENDING, FriendRequestStatus.ACCEPTED)
        ).ifPresent(x -> { throw new ResponseStatusException(HttpStatus.CONFLICT, "상대가 이미 보냈거나 친구입니다."); });

        FriendRequest saved = requestRepo.save(FriendRequest.builder()
                .requester(meU)
                .receiver(tgU)
                .status(FriendRequestStatus.PENDING)
                .build());

        FriendRequestDto dto = toDto(saved);

        // 이메일 기준 토픽
        messaging.convertAndSend("/topic/friend-requests/" + meU.getEmail(), dto);
        messaging.convertAndSend("/topic/friend-requests/" + tgU.getEmail(), dto);
        return dto;
    }

    @Transactional
    public FriendRequestDto accept(Long id, String myEmail) {
        FriendRequest fr = requestRepo.findByIdAndReceiver_Email(id, myEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "요청이 없거나 권한이 없습니다."));
        fr.setStatus(FriendRequestStatus.ACCEPTED);

        FriendRequestDto dto = toDto(fr);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getEmail(), dto);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getEmail(), dto);
        return dto;
    }

    @Transactional
    public FriendRequestDto decline(Long id, String myEmail) {
        FriendRequest fr = requestRepo.findByIdAndReceiver_Email(id, myEmail)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "요청이 없거나 권한이 없습니다."));

        FriendRequestDto dto = toDto(fr);
        requestRepo.delete(fr);

        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getEmail(), dto);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getEmail(), dto);
        return dto;
    }

    @Transactional
    public void cancel(Long id, String myEmail) {
        FriendRequest fr = requestRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "요청을 찾을 수 없습니다."));

        if (!fr.getRequester().getEmail().equalsIgnoreCase(myEmail)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "요청자만 취소할 수 있습니다.");
        }
        if (fr.getStatus() != FriendRequestStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 처리된 요청입니다.");
        }

        requestRepo.delete(fr);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getEmail(), "CANCELLED");
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getEmail(), "CANCELLED");
    }

    @Transactional(readOnly = true)
    public boolean areFriendsByEmail(String myEmail, String otherEmail) {
        return requestRepo.existsByStatusAndRequester_EmailAndReceiver_Email(
                FriendRequestStatus.ACCEPTED, myEmail, otherEmail)
                || requestRepo.existsByStatusAndRequester_EmailAndReceiver_Email(
                FriendRequestStatus.ACCEPTED, otherEmail, myEmail);
    }

    @Transactional(readOnly = true)
    public List<String> myFriends(String myEmail) {
        return requestRepo
                .findByStatusAndRequester_EmailOrStatusAndReceiver_Email(
                        FriendRequestStatus.ACCEPTED, myEmail,
                        FriendRequestStatus.ACCEPTED, myEmail)
                .stream()
                .map(fr -> myEmail.equalsIgnoreCase(fr.getRequester().getEmail())
                        ? fr.getReceiver().getEmail()
                        : fr.getRequester().getEmail())
                .distinct()
                .toList();
    }
}
