package com.realtime.chatting.friend.service;

import com.realtime.chatting.friend.dto.FriendRequestDto;
import com.realtime.chatting.friend.entity.FriendRequest;
import com.realtime.chatting.friend.model.FriendRequestStatus;
import com.realtime.chatting.friend.repository.FriendRequestRepository;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FriendRequestService {

    private final FriendRequestRepository requestRepo;
    private final UserRepository userRepo;
    private final SimpMessagingTemplate messaging;

    private FriendRequestDto toDto(FriendRequest fr) {
        return new FriendRequestDto(
                fr.getId(),
                fr.getRequester().getUsername(),
                fr.getReceiver().getUsername(),
                fr.getStatus(),
                fr.getCreatedAt()
        );
    }

    @Transactional
    public FriendRequestDto send(String me, String target) {
        if (me.equals(target)) throw new IllegalArgumentException("자기 자신에게는 보낼 수 없습니다.");

        User meU = userRepo.findById(me).orElseThrow();
        User tgU = userRepo.findById(target).orElseThrow();

        // 중복/역중복 및 이미 친구 방지
        requestRepo.findByRequester_UsernameAndReceiver_UsernameAndStatusIn(
                me, target, List.of(FriendRequestStatus.PENDING, FriendRequestStatus.ACCEPTED)
        ).ifPresent(x -> { throw new IllegalStateException("이미 요청했거나 친구입니다."); });

        requestRepo.findByRequester_UsernameAndReceiver_UsernameAndStatusIn(
                target, me, List.of(FriendRequestStatus.PENDING, FriendRequestStatus.ACCEPTED)
        ).ifPresent(x -> { throw new IllegalStateException("상대가 이미 보냈거나 친구입니다."); });

        FriendRequest saved = requestRepo.save(FriendRequest.builder()
                .requester(meU)
                .receiver(tgU)
                .status(FriendRequestStatus.PENDING)
                .build());

        FriendRequestDto dto = toDto(saved);
        // 실시간: 양쪽 목록 새로고침 신호
        messaging.convertAndSend("/topic/friend-requests/" + me, dto);
        messaging.convertAndSend("/topic/friend-requests/" + target, dto);
        return dto;
    }

    @Transactional(readOnly = true)
    public List<FriendRequestDto> incoming(String me) {
        return requestRepo.findByReceiver_UsernameAndStatus(me, FriendRequestStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<FriendRequestDto> outgoing(String me) {
        return requestRepo.findByRequester_UsernameAndStatus(me, FriendRequestStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public FriendRequestDto accept(Long id, String me) {
        FriendRequest fr = requestRepo.findByIdAndReceiver_Username(id, me)
                .orElseThrow(() -> new IllegalArgumentException("요청이 없거나 권한이 없습니다."));
        fr.setStatus(FriendRequestStatus.ACCEPTED);
        FriendRequestDto dto = toDto(fr);

        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getUsername(), dto);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getUsername(), dto);
        return dto;
    }

    @Transactional
    public FriendRequestDto decline(Long id, String me) {
        FriendRequest fr = requestRepo.findByIdAndReceiver_Username(id, me)
                .orElseThrow(() -> new IllegalArgumentException("요청이 없거나 권한이 없습니다."));
        fr.setStatus(FriendRequestStatus.DECLINED);
        FriendRequestDto dto = toDto(fr);

        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getUsername(), dto);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getUsername(), dto);
        return dto;
    }

    @Transactional
    public void cancel(Long id, String me) {
        FriendRequest fr = requestRepo.findById(id).orElseThrow();
        if (!fr.getRequester().getUsername().equals(me))
            throw new IllegalArgumentException("요청자가 아니므로 취소할 수 없습니다.");
        requestRepo.delete(fr);
        messaging.convertAndSend("/topic/friend-requests/" + fr.getRequester().getUsername(), "CANCELLED");
        messaging.convertAndSend("/topic/friend-requests/" + fr.getReceiver().getUsername(), "CANCELLED");
    }
}
