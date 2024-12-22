package com.realtime.chatting.controller;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.realtime.chatting.entity.RequestChat;
import com.realtime.chatting.service.ChattingService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequiredArgsConstructor
@Slf4j
public class ChattingController {
	
	private final RabbitTemplate rabbitTemplate;
	
	@PostMapping("/api/chat/send")
    public void sendMessage(@RequestBody RequestChat requestChat) {
        // 메시지를 RabbitMQ 큐로 전송 (기본적으로 'chatQueue' 큐로 전송)
        rabbitTemplate.convertAndSend("chatExchange", "chat.message", requestChat.getMessage());
    }
}