package com.realtime.chatting.chat.controller;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import com.realtime.chatting.chat.dto.MessageDto;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class ChatMessageReceiver {
    private final SimpMessagingTemplate messagingTemplate;
    public void receiveMessage(MessageDto payload) {
        String destination = "/topic/rooms/" + payload.getRoomId();
        messagingTemplate.convertAndSend(destination, payload);
    }
}
