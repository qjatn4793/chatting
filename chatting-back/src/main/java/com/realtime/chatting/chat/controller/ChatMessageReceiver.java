package com.realtime.chatting.chat.controller;

import java.util.Date;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import com.realtime.chatting.chat.entity.RequestChat;
import com.realtime.chatting.chat.service.ChattingService;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class ChatMessageReceiver {
    private final SimpMessagingTemplate messagingTemplate;
    private final ChattingService chattingService;

    public void receiveMessage(RequestChat requestChat) {
        requestChat.setTimestamp(new Date());
        chattingService.saveMessage(requestChat);
        messagingTemplate.convertAndSend("/topic/messages", requestChat);
    }
}