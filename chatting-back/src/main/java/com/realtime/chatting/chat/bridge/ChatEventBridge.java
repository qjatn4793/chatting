package com.realtime.chatting.chat.bridge;

import com.realtime.chatting.chat.dto.ChatNotify;
import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.config.RabbitConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChatEventBridge {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatRoomMemberRepository memberRepo;

    @Transactional
    @RabbitListener(queues = RabbitConfig.WS_BRIDGE_QUEUE)
    public void onMessage(
            MessageDto message,
            @Header(name = AmqpHeaders.RECEIVED_ROUTING_KEY, required = false) String routingKey
    ) {
        String roomId = resolveRoomId(message, routingKey);
        if (roomId == null) return;

        // 1) 방 브로드캐스트
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId, message);

        // 2) 미읽음 +1 : sender는 UUID 문자열이어야 함
        UUID senderUuid = null;
        String senderRaw = String.valueOf(message.getMessageId());
        if (senderRaw != null && !senderRaw.isBlank()) {
            try {
                senderUuid = UUID.fromString(senderRaw);
                memberRepo.bumpUnread(roomId, senderUuid);
            } catch (IllegalArgumentException ex) {
                log.warn("ChatEventBridge: sender is not a UUID: {}", senderRaw);
            }
        }

        // 3) 사용자별 알림 (구독 키 = UUID 문자열)
        //    레포지토리도 UUID 리스트를 반환하도록 변경했으므로 그에 맞춰 처리
        List<UUID> participantIds = memberRepo.findParticipantIds(roomId);

        String preview = abbreviate(message.getContent(), 80);
        for (UUID uid : participantIds) {
            if (uid == null) continue;
            // 본인에게는 알림 X
            if (senderUuid != null && uid.equals(senderUuid)) continue;

            ChatNotify notif = new ChatNotify(
                    roomId,
                    senderUuid != null ? senderUuid.toString() : senderRaw, // 알림에 보낼 sender 식별자
                    preview,
                    System.currentTimeMillis()
            );
            messagingTemplate.convertAndSend("/topic/chat-notify/" + uid.toString(), notif);
        }
    }

    private String resolveRoomId(MessageDto m, String rk) {
        String roomId = m.getRoomId();
        if ((roomId == null || roomId.isBlank()) && rk != null && rk.startsWith("chat.message.room.")) {
            roomId = rk.substring("chat.message.room.".length());
        }
        if (roomId == null || roomId.isBlank()) {
            log.warn("WS bridge dropped: roomId missing. rk={}, payload={}", rk, m);
            return null;
        }
        return roomId;
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, Math.max(0, max - 1)) + "…";
    }
}