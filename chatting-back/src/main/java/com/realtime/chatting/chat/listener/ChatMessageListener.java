package com.realtime.chatting.chat.listener;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;

public class ChatMessageListener implements MessageListener {

    private final SimpMessagingTemplate messagingTemplate;

    public ChatMessageListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @Override
    public void onMessage(Message message) {
        String msgContent = new String(message.getBody());
        // WebSocket을 통해 클라이언트에게 메시지 전달
        messagingTemplate.convertAndSend("/topic/messages", msgContent);
    }
}