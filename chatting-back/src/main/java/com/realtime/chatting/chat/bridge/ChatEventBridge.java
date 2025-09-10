package com.realtime.chatting.chat.bridge;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.config.RabbitConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @RabbitListener(queues = RabbitConfig.WS_BRIDGE_QUEUE) // "chat.ws-bridge"
    public void onMessage(
            MessageDto message,
            @Header(name = AmqpHeaders.RECEIVED_ROUTING_KEY, required = false) String rk
    ) {
        try {
            String roomId = message.getRoomId();
            if ((roomId == null || roomId.isBlank()) && rk != null && rk.startsWith("chat.message.room.")) {
                roomId = rk.substring("chat.message.room.".length());
            }
            if (roomId == null || roomId.isBlank()) {
                log.warn("WS bridge dropped: roomId missing. rk={}, payload={}", rk, message);
                return;
            }
            String dest = "/topic/rooms/" + roomId; // ✅ 서버-클라 통일 주소
            log.debug("WS bridge -> {} :: {}", dest, message);
            messagingTemplate.convertAndSend(dest, message);
        } catch (Exception e) {
            log.error("WS bridge failed", e);
        }
    }
}
