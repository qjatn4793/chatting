package com.realtime.chatting.chat.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.realtime.chatting.chat.dto.ReadAck;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RoomReadService {
    private final ChatRoomMemberRepository memberRepo;

    @Transactional
    public ReadAck markRead(String roomId, String me /* UUID 문자열 */) {
        UUID meId = UUID.fromString(me);
        memberRepo.resetUnread(roomId, meId);
        String peer = String.valueOf(memberRepo.findDmPeerId(roomId, meId)); // UUID 문자열
        return new ReadAck(peer);
    }
}
