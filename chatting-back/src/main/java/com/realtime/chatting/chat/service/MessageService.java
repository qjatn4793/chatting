package com.realtime.chatting.chat.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
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
    private final ChatRoomMemberRepository memberRepo;

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
            .roomId(roomId)
            .messageId(messageId)
            .sender(sender)
            .username(username)
            .content(content)
            .createdAt(Instant.now())
            .build();
        m = messageRepo.save(m);
        return MessageDto.builder()
            .id(m.getId())
            .roomId(roomId)
            .messageId(UUID
            .fromString(messageId))
            .sender(sender)
            .username(username)
            .content(content)
            .createdAt(m.getCreatedAt())
            .build();
    }

    /** 주어진 roomIds 중 "나"가 구성원인 방만 필터링 후 각 방의 최신 메시지 1건씩 반환 */
    public List<MessageDto> lastMessagesBulk(UUID myUserId, List<String> roomIds) {
        if (roomIds == null || roomIds.isEmpty()) return Collections.emptyList();

        // ❶ 멤버십 검증: 내가 속한 방만 허용
        List<String> authorized = memberRepo.findAuthorizedRoomIds(myUserId, roomIds);
        if (authorized.isEmpty()) return Collections.emptyList();

        // ❷ 최신 메시지 1건/방
        var rows = messageRepo.findLastMessagePerRoom(authorized);

        // ❸ DTO 매핑 (DB: DATETIME(6) → Timestamp → Instant)
        return rows.stream().map(r -> MessageDto.builder()
                .id(r.getId())
                .roomId(r.getRoomId())
                .messageId(parseUuidSafe(r.getMessageId()))
                .sender(r.getSender())
                .username(r.getUsername())
                .content(r.getContent())
                .createdAt(Optional.ofNullable(r.getCreatedAt())
                        .map(ts -> ts.toInstant().atOffset(ZoneOffset.UTC).toInstant())
                        .orElse(null))
                .build()
        ).collect(Collectors.toList());
    }

    private static UUID parseUuidSafe(String s) {
        try { return s == null ? null : UUID.fromString(s); }
        catch (Exception ignore) { return null; }
    }
}
