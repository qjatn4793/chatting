package com.realtime.chatting.chat.service;

import com.realtime.chatting.chat.dto.RoomDto;
import com.realtime.chatting.chat.entity.ChatRoom;
import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.chat.repository.ChatRoomRepository;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final ChatRoomRepository roomRepo;
    private final ChatRoomMemberRepository memberRepo;
    private final UserRepository userRepo;

    /** meId: Authentication.name (UUID 문자열) */
    public List<RoomDto> myRooms(String meId) {
        UUID uid = UUID.fromString(meId);
        User me = userRepo.findById(uid).orElseThrow();

        return memberRepo.findByUser(me).stream()
                .map(ChatRoomMember::getRoom)
                .distinct()
                .map(r -> RoomDto.builder()
                        .id(r.getId())
                        .type(r.getType().name())
                        .createdAt(r.getCreatedAt())
                        .members(
                                memberRepo.findByRoom(r).stream()
                                        .map(mm -> {
                                            String email = mm.getUser().getEmail();
                                            return (email != null && !email.isBlank())
                                                    ? email
                                                    : mm.getUser().getId().toString(); // email 없으면 UUID 문자열
                                        })
                                        .collect(Collectors.toList())
                        )
                        .build())
                .collect(Collectors.toList());
    }

    /** DM 열기: UUID 시그니처 */
    @Transactional
    public RoomDto openDmById(UUID meId, UUID otherId) {
        if (meId.equals(otherId)) throw new IllegalArgumentException("cannot dm yourself");

        User meU = userRepo.findById(meId).orElseThrow();
        User otU = userRepo.findById(otherId).orElseThrow();

        // DM room key: UUID 문자열 조합
        String a = meId.toString();
        String b = otherId.toString();
        String key = (a.compareTo(b) < 0) ? a + ":" + b : b + ":" + a;
        String roomId = UUID.nameUUIDFromBytes(key.getBytes()).toString();

        ChatRoom room = roomRepo.findById(roomId).orElseGet(() -> {
            ChatRoom nr = ChatRoom.builder()
                    .id(roomId)
                    .type(ChatRoom.Type.DM)
                    .createdAt(Instant.now())
                    .build();
            return roomRepo.save(nr);
        });

        ensureMember(room, meU);
        ensureMember(room, otU);

        return RoomDto.builder()
                .id(room.getId())
                .type(room.getType().name())
                .createdAt(room.getCreatedAt())
                .members(Arrays.asList(a, b)) // 필요에 따라 이메일로 바꿔도 됨
                .build();
    }

    private void ensureMember(ChatRoom room, User user) {
        memberRepo.findByRoomAndUser(room, user)
                .orElseGet(() -> memberRepo.save(
                        ChatRoomMember.builder().room(room).user(user).build()
                ));
    }
}
