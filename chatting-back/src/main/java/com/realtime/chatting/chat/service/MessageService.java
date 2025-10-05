package com.realtime.chatting.chat.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.entity.ChatMessage;
import com.realtime.chatting.chat.repository.ChatMessageRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final ChatMessageRepository messageRepo;

    public List<MessageDto> history(String roomId, int limit) {
        return messageRepo
                .findByRoomIdOrderByCreatedAtDesc(roomId, PageRequest.of(0, limit))
                .stream()
                .map(m -> MessageDto.builder()
                        .id(m.getId())
                        .roomId(m.getRoomId())
                        .messageId(UUID.fromString(m.getMessageId()))
                        .username(m.getUsername())
                        .sender(m.getSender())
                        .content(m.getContent())
                        .createdAt(m.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    public MessageDto save(String roomId, String messageId, String username, String sender, String content) {
        ChatMessage m = ChatMessage.builder()
            .roomId(roomId).messageId(messageId).sender(sender).username(username).content(content).createdAt(Instant.now())
            .build();
        m = messageRepo.save(m);
        return MessageDto.builder()
            .id(m.getId()).roomId(roomId).messageId(UUID.fromString(messageId)).sender(sender).username(username).content(content).createdAt(m.getCreatedAt()).build();
    }
}
