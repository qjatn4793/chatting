package com.realtime.chatting.chat.service;


import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;

import com.realtime.chatting.chat.dto.ReadAck;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;

@Service
@RequiredArgsConstructor
public class RoomReadService {
  private final ChatRoomMemberRepository memberRepo;

  @Transactional // @Modifying 쿼리 트랜잭션 경계
  public ReadAck markRead(String roomId, String me) {
    memberRepo.resetUnread(roomId, me);            // 0으로
    String peer = memberRepo.findDmPeerUsername(roomId, me); // DM 상대
    return new ReadAck(peer);
  }
}