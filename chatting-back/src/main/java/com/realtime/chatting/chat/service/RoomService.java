package com.realtime.chatting.chat.service;

import com.realtime.chatting.chat.dto.InviteResponse;
import com.realtime.chatting.chat.dto.RoomDto;
import com.realtime.chatting.chat.entity.ChatRoom;
import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.chat.repository.ChatRoomRepository;
import com.realtime.chatting.friend.service.FriendService;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final ChatRoomRepository roomRepo;
    private final ChatRoomMemberRepository memberRepo;
    private final UserRepository userRepo;
    private final FriendService friendService;

    /** meId: Authentication.name (UUID 문자열) */
    public List<RoomDto> myRooms(String meId) {
        UUID uid = UUID.fromString(meId);
        User me = userRepo.findById(uid).orElseThrow();

        return memberRepo.findByUser(me).stream()
            .map(ChatRoomMember::getRoom)
            .distinct()
            .map(r -> {
                // 모든 멤버(UUID로 문자열화)
                List<String> memberStrings = memberRepo.findByRoom(r).stream()
                        .map(mm -> mm.getUser().getId().toString())
                        .collect(Collectors.toList());

                // title 계산
                String title = null;
                if (r.getType() == ChatRoom.Type.DM) {
                    // DM이면 '상대'의 username을 title에 넣는다
                    var peers = memberRepo.findByRoom(r);
                    var peer = peers.stream()
                            .map(ChatRoomMember::getUser)
                            .filter(u -> !u.getId().equals(uid))
                            .findFirst()
                            .orElse(null);

                    if (peer != null) {
                        title = peer.getUsername();
                    } else {
                        title = "방 제목 없음"; // 안전망
                    }
                } else {
                    title = (r.getTitle() != null && !r.getTitle().isBlank()) ? r.getTitle() : null;
                }

                return RoomDto.builder()
                        .id(r.getId())
                        .type(r.getType().name())
                        .createdAt(r.getCreatedAt())
                        .members(memberStrings)
                        .title(title)
                        .build();
            })
            .collect(Collectors.toList());
    }

    /** 방 단건 조회: 요청자가 멤버인지 확인 후 RoomDto 반환 */
    @Transactional(readOnly = true)
    public RoomDto getRoomForMember(UUID myId, String roomId) {
        if (roomId == null || roomId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roomId is required");
        }

        ChatRoom room = roomRepo.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "room not found"));

        User me = userRepo.findById(myId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "me not found"));

        boolean iAmMember = memberRepo.findByRoomAndUser(room, me).isPresent();
        if (!iAmMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not a member of this room");
        }

        // 멤버 목록(email 있으면 email, 없으면 UUID 문자열) — InviteModal에서 비교에 사용
        List<String> memberStrings = memberRepo.findByRoom(room).stream()
                .map(mm -> {
                    String email = mm.getUser().getEmail();
                    return (email != null && !email.isBlank()) ? email : mm.getUser().getId().toString();
                })
                .toList();

        // 타이틀: DM이면 상대 username, GROUP이면 저장된 title(없으면 null)
        String title;
        if (room.getType() == ChatRoom.Type.DM) {
            var peers = memberRepo.findByRoom(room);
            var peer = peers.stream()
                    .map(ChatRoomMember::getUser)
                    .filter(u -> !u.getId().equals(myId))
                    .findFirst()
                    .orElse(null);
            title = (peer != null && peer.getUsername() != null && !peer.getUsername().isBlank())
                    ? peer.getUsername()
                    : "방 제목 없음";
        } else {
            title = (room.getTitle() != null && !room.getTitle().isBlank()) ? room.getTitle() : null;
        }

        return RoomDto.builder()
                .id(room.getId())
                .type(room.getType().name())
                .createdAt(room.getCreatedAt())
                .members(memberStrings)
                .title(title)
                .build();
    }

    @Transactional
    public RoomDto createGroupRoom(UUID creatorId, String title, List<UUID> inviteeIds) {
        String roomId = UUID.randomUUID().toString();
        ChatRoom room = ChatRoom.builder()
                .id(roomId)
                .type(ChatRoom.Type.GROUP)
                .createdAt(Instant.now())
                .title(title)                      // ◀ DB 저장
                .build();
        room = roomRepo.save(room);

        // 멤버: 본인 + 초대 대상
        LinkedHashSet<UUID> all = new LinkedHashSet<>();
        all.add(creatorId);
        if (inviteeIds != null) all.addAll(inviteeIds);

        List<User> users = userRepo.findAllById(all);
        Map<UUID, User> byId = users.stream().collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        for (UUID uid : all) {
            User u = byId.get(uid);
            if (u == null) continue;
            ChatRoom finalRoom = room;
            memberRepo.findByRoomAndUser(room, u)
                    .orElseGet(() -> memberRepo.save(
                            ChatRoomMember.builder()
                                    .room(finalRoom)
                                    .user(u)
                                    .joinedAt(Instant.now())
                                    .build()
                    ));
        }

        List<String> memberStrings = users.stream()
                .map(u -> (u.getEmail() != null && !u.getEmail().isBlank()) ? u.getEmail() : u.getId().toString())
                .toList();

        return RoomDto.builder()
                .id(room.getId())
                .type(room.getType().name())
                .createdAt(room.getCreatedAt())
                .members(memberStrings)
                .title(room.getTitle())          // ◀ 저장된 제목 반환
                .build();
    }

    /** DM 열기: UUID 시그니처 */
    @Transactional
    public RoomDto openDmById(UUID meId, UUID otherId) {
        if (meId.equals(otherId)) throw new IllegalArgumentException("cannot dm yourself");

        User meU = userRepo.findById(meId).orElseThrow();
        User otU = userRepo.findById(otherId).orElseThrow();

        String a = meId.toString();
        String b = otherId.toString();
        String key = (a.compareTo(b) < 0) ? a + ":" + b : b + ":" + a;
        String roomId = UUID.nameUUIDFromBytes(key.getBytes()).toString();

        // '나'의 관점에서 title은 "상대 username"
        String title = (otU.getUsername() != null && !otU.getUsername().isBlank())
                ? otU.getUsername()
                : (otU.getEmail() != null && !otU.getEmail().isBlank() ? otU.getEmail() : otU.getId().toString());

        ChatRoom room = roomRepo.findById(roomId).orElseGet(() -> {
            ChatRoom nr = ChatRoom.builder()
                    .id(roomId)
                    .type(ChatRoom.Type.DM)
                    .createdAt(Instant.now())
                    .title(title)
                    .build();
            return roomRepo.save(nr);
        });

        ensureMember(room, meU);
        ensureMember(room, otU);

        return RoomDto.builder()
                .id(room.getId())
                .type(room.getType().name())
                .createdAt(room.getCreatedAt())
                .members(Arrays.asList(a, b))
                .title(title)
                .build();
    }

    private void ensureMember(ChatRoom room, User user) {
        memberRepo.findByRoomAndUser(room, user)
                .orElseGet(() -> memberRepo.save(
                        ChatRoomMember.builder().room(room).user(user).build()
                ));
    }

    /* ===================== 초대 로직 ===================== */

    @Transactional
    public InviteResponse inviteMembers(UUID myId, String roomId, List<String> identifiers) {
        if (roomId == null || roomId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roomId is required");
        }

        ChatRoom room = roomRepo.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "room not found"));

        User me = userRepo.findById(myId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "me not found"));

        // 초대자는 방 멤버여야 함
        boolean iAmMember = memberRepo.findByRoomAndUser(room, me).isPresent();
        if (!iAmMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not a member of this room");
        }

        // 식별자 정제
        List<String> cleaned = (identifiers == null ? List.<String>of() : identifiers).stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(500)
                .toList();

        // 이미 멤버의 set
        Set<UUID> memberIds = memberRepo.findByRoom(room).stream()
                .map(m -> m.getUser().getId())
                .collect(Collectors.toSet());

        List<String> invited = new ArrayList<>();
        List<String> alreadyMembers = new ArrayList<>();
        List<String> notFound = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        for (String idf : cleaned) {
            Optional<User> maybe = resolveUser(idf);
            if (maybe.isEmpty()) {
                notFound.add(idf);
                continue;
            }
            User target = maybe.get();

            String label = (target.getEmail() != null && !target.getEmail().isBlank())
                    ? target.getEmail()
                    : target.getId().toString();

            // 자기 자신
            if (target.getId().equals(myId)) {
                alreadyMembers.add(label);
                continue;
            }
            // 이미 멤버
            if (memberIds.contains(target.getId())) {
                alreadyMembers.add(label);
                continue;
            }
            // 친구 여부 제한 (정책 유지)
            if (!friendService.areFriendsByUserId(myId, target.getId())) {
                failed.add(label); // not friends
                continue;
            }

            // 초대(멤버 추가)
            ensureMember(room, target);
            memberIds.add(target.getId());
            invited.add(label);
        }

        // 모두 이미 멤버/불가 케이스인 경우 409 반환(UX 선명)
        if (invited.isEmpty() && notFound.isEmpty() && failed.isEmpty() && !alreadyMembers.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "all identifiers are already members of the room");
        }

        // DM 방이 3인 이상이 되면 GROUP으로 승격
        if (room.getType() == ChatRoom.Type.DM && memberIds.size() >= 3) {
            room.setType(ChatRoom.Type.GROUP);
            roomRepo.save(room);
        }

        return new InviteResponse(invited, alreadyMembers, notFound, failed);
    }

    private Optional<User> resolveUser(String identifier) {
        // UUID 우선 판별
        UUID asUuid = tryParseUuid(identifier);
        if (asUuid != null) {
            return userRepo.findById(asUuid);
        }
        // 이메일/휴대폰/username 유연 매칭 (FriendService 재사용)
        return friendService.findUserByFlexibleIdentifier(identifier);
    }

    private UUID tryParseUuid(String s) {
        try {
            return UUID.fromString(s);
        } catch (Exception e) {
            return null;
        }
    }
}
