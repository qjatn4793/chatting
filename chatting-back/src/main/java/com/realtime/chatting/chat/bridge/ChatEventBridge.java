package com.realtime.chatting.chat.bridge;

import com.realtime.chatting.chat.dto.ChatNotify;
import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.config.RabbitConfig;

import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChatEventBridge {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatRoomMemberRepository memberRepo; // 참여자 조회용

    @Transactional // Modifying 쿼리 사용
    @RabbitListener(queues = RabbitConfig.WS_BRIDGE_QUEUE)
    public void onMessage(MessageDto message,
                          @Header(name = AmqpHeaders.RECEIVED_ROUTING_KEY, required = false) String routingKey) {
      String roomId = resolveRoomId(message, routingKey);
      if (roomId == null) return;

      // 1) 방으로 메시지 브로드캐스트(채팅 화면)
      messagingTemplate.convertAndSend("/topic/rooms/" + roomId, message);

      // 2) 미읽음 +1 (보낸 본인 제외)
      String sender = message.getSender();
      memberRepo.bumpUnread(roomId, sender);

      // 3) 사용자별 알림(친구목록/다른 화면)
      List<String> users = memberRepo.findParticipantUsernames(roomId);
      String preview = abbreviate(message.getContent(), 80);
      for (String u : users) {
        if (u == null || u.equals(sender)) continue;
        var notif = new ChatNotify(roomId, sender, preview, System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/chat-notify/" + u, notif);
      }
    }

    private String resolveRoomId(MessageDto m, String rk) {
      String roomId = m.getRoomId();
      if ((roomId == null || roomId.isBlank()) && rk != null && rk.startsWith("chat.message.room."))
        roomId = rk.substring("chat.message.room.".length());
      if (roomId == null || roomId.isBlank()) {
        log.warn("WS bridge dropped: roomId missing. rk={}, payload={}", rk, m);
        return null;
      }
      return roomId;
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, Math.max(0, max - 1)) + "…";
        // 한글 잘림이 걱정되면 ICU4J 등 글자 경계로 자르세요.
    }

}
