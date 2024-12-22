package com.realtime.chatting.chat.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.realtime.chatting.chat.entity.RequestChat;
import com.realtime.chatting.chat.repository.RequestChatRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChattingService {
	
	private final RequestChatRepository requestChatRepository;

    public RequestChat saveMessage(RequestChat requestChat) {
        return requestChatRepository.save(requestChat);
    }

    public List<RequestChat> getAllMessages() {
        return requestChatRepository.findAll();
    }
}
