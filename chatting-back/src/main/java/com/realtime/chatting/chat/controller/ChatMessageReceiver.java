package com.realtime.chatting.chat.controller;

import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import com.realtime.chatting.chat.entity.RequestChat;
import com.realtime.chatting.chat.service.ChattingService;

@Component
public class ChatMessageReceiver {

    private final SimpMessagingTemplate messagingTemplate;
    
    @Autowired
    private ChattingService chattingService;

    @Autowired
    public ChatMessageReceiver(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // RabbitMQ로부터 받은 메시지를 WebSocket을 통해 클라이언트로 전송
    public void receiveMessage(RequestChat requestChat) {
    	
    	requestChat.setTimestamp(new Date());
    	
    	// 메세지 이력 저장
    	chattingService.saveMessage(requestChat);
    	
        // /topic/messages 채널로 메시지를 전송
        messagingTemplate.convertAndSend("/topic/messages", requestChat);
    }
}