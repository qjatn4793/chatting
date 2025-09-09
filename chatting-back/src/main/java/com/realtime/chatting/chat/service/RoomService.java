package com.realtime.chatting.chat.service;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.realtime.chatting.chat.entity.ChatRoom;
import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.chat.repository.ChatRoomRepository;
import com.realtime.chatting.chat.dto.RoomDto;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RoomService {
    private final ChatRoomRepository roomRepo;
    private final ChatRoomMemberRepository memberRepo;
    private final UserRepository userRepo;

    public List<RoomDto> myRooms(String username) {
        User me = userRepo.findById(username).orElseThrow();
        return memberRepo.findByUser(me).stream()
            .map(ChatRoomMember::getRoom)
            .distinct()
            .map(r -> RoomDto.builder()
                .id(r.getId())
                .type(r.getType().name())
                .createdAt(r.getCreatedAt())
                .members(memberRepo.findByRoom(r).stream().map(mm -> mm.getUser().getUsername()).collect(Collectors.toList()))
                .build())
            .collect(Collectors.toList());
    }

    @Transactional
    public RoomDto openDm(String me, String other) {
        if (me.equals(other)) throw new IllegalArgumentException("cannot dm yourself");
        User meU = userRepo.findById(me).orElseThrow();
        User otU = userRepo.findById(other).orElseThrow();

        String key = (me.compareTo(other) < 0) ? me + ":" + other : other + ":" + me;
        String roomId = java.util.UUID.nameUUIDFromBytes(key.getBytes()).toString();

        // 선언과 동시에 한 번만 대입
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
                .members(java.util.Arrays.asList(me, other))
                .build();
    }

    private void ensureMember(ChatRoom room, User user) {
        memberRepo.findByRoomAndUser(room, user)
                .orElseGet(() -> memberRepo.save(
                        ChatRoomMember.builder().room(room).user(user).build()
                ));
    }
}
