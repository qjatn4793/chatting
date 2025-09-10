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
            @Header(name = AmqpHeaders.RECEIVED_ROUTING_KEY, required = false) String routingKey
    ) {
        try {
            String roomId = message.getRoomId();
            // roomId가 비어 있으면 라우팅키 "chat.message.room.{roomId}"에서 파싱
            if ((roomId == null || roomId.isBlank())
                    && routingKey != null
                    && routingKey.startsWith("chat.message.room.")) {
                roomId = routingKey.substring("chat.message.room.".length());
            }
            if (roomId == null || roomId.isBlank()) {
                log.warn("WS bridge dropped: roomId missing. rk={}, payload={}", routingKey, message);
                return;
            }

            String destination = "/topic/rooms/" + roomId;
            log.info("WS bridge -> {} (rk={})", destination, routingKey);
            messagingTemplate.convertAndSend(destination, message);

        } catch (Exception e) {
            log.error("WS bridge failed", e);
        }
    }
}
