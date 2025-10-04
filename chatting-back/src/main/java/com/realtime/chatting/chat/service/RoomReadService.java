package com.realtime.chatting.chat.service;

import java.util.UUID;

import com.realtime.chatting.chat.entity.ChatRoom;
import com.realtime.chatting.chat.repository.ChatRoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.realtime.chatting.chat.dto.ReadAck;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RoomReadService {
    private final ChatRoomMemberRepository memberRepo;
    private final ChatRoomRepository roomRepo; // 방 타입 확인용 (DM만 peer 조회)

    @Transactional
    public ReadAck markRead(String roomId, String me /* UUID 문자열 */) {
        final UUID meId = UUID.fromString(me);

        // 1) 내 unread 0으로 (업데이트 결과로 ok 판단)
        final int updated = memberRepo.resetUnread(roomId, meId);
        final boolean ok = updated > 0;

        // 2) DM일 때만 peerId 조회 (그 외에는 null)
        String peerId = null;
        ChatRoom room = roomRepo.findById(roomId).orElse(null);
        if (room != null && room.getType() == ChatRoom.Type.DM) {
            peerId = memberRepo.findDmPeerId(roomId, meId).orElse(null);
        }

        // 3) 표준 응답
        return new ReadAck(roomId, meId, peerId, 0, ok);
    }
}