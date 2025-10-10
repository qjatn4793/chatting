package com.realtime.chatting.chat.service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.config.RabbitConfig;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ChatFanoutService {

    private final RabbitTemplate rabbitTemplate;

    @Async("chatExecutor")
    public void publishToBrokerAsync(String roomId, MessageDto msg) {
        String routingKey = "chat.message.room." + roomId;
        rabbitTemplate.convertAndSend(RabbitConfig.CHAT_EXCHANGE, routingKey, msg);
    }
}
