package com.realtime.chatting.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
public class ChatMessageReceiver {

    private final SimpMessagingTemplate messagingTemplate;

    @Autowired
    public ChatMessageReceiver(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // RabbitMQ로부터 받은 메시지를 WebSocket을 통해 클라이언트로 전송
    public void receiveMessage(String message) {
        // /topic/messages 채널로 메시지를 전송
        messagingTemplate.convertAndSend("/topic/messages", message);
    }
}