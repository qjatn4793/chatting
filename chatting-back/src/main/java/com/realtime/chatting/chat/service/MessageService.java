package com.realtime.chatting.chat.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

import com.realtime.chatting.chat.dto.AttachmentDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.storage.entity.ChatAttachment;
import com.realtime.chatting.storage.repository.ChatAttachmentRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.entity.ChatMessage;
import com.realtime.chatting.chat.repository.ChatMessageRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final ChatMessageRepository messageRepo;
    private final ChatRoomMemberRepository memberRepo;
    private final ChatAttachmentRepository attachmentRepo;

    @Transactional(readOnly = true)
    public List<MessageDto> history(String roomId, int limit) {
        int capped = Math.min(200, Math.max(1, limit));

        // 최신 N개 DESC로 가져오기 (createdAt, id 인덱스 권장)
        var page = PageRequest.of(0, capped, Sort.by(Sort.Direction.DESC, "createdAt"));
        List<ChatMessage> msgsDesc = messageRepo.findByRoomIdOrderByCreatedAtDesc(roomId, page);
        if (msgsDesc.isEmpty()) return List.of();

        // messageId 문자열 목록 (엔티티가 UUID면 toString)
        List<String> mids = msgsDesc.stream()
                .map(ChatMessage::getMessageId)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        // 첨부 일괄 조회 → messageId로 그룹핑
        Map<String, List<AttachmentDto>> grouped;
        if (!mids.isEmpty()) {
            List<ChatAttachment> atts = attachmentRepo.findByMessage_MessageIdInOrderByIdAsc(mids);
            grouped = atts.stream().collect(Collectors.groupingBy(
                    a -> a.getMessage().getMessageId(),
                    LinkedHashMap::new,
                    Collectors.mapping(a -> AttachmentDto.builder()
                            .id(a.getId())
                            .storageKey(a.getStorageKey())
                            .url(a.getPublicUrl())
                            .size(a.getSize())
                            .contentType(a.getContentType())
                            .originalName(a.getOriginalName())
                            .width(a.getWidth())
                            .height(a.getHeight())
                            .createdAt(a.getCreatedAt())
                            .build(), Collectors.toList())
            ));
        } else {
            grouped = Collections.emptyMap();
        }

        // DTO 매핑 (DESC → 나중에 ASC로 뒤집기)
        List<MessageDto> dtosDesc = msgsDesc.stream().map(m -> MessageDto.builder()
                .id(m.getId())
                .roomId(m.getRoomId())
                .messageId(UUID.fromString(m.getMessageId())) // 문자열 그대로
                .sender(m.getSender())
                .username(m.getUsername())
                .content(m.getContent())
                .createdAt(m.getCreatedAt())
                .attachments(grouped.getOrDefault(m.getMessageId(), List.of()))
                .build()
        ).toList();

        // 프론트 렌더 순서(과거→현재)에 맞추어 ASC로 정렬해 반환
        List<MessageDto> dtosAsc = new ArrayList<>(dtosDesc);
        dtosAsc.sort(Comparator.comparing(MessageDto::getCreatedAt));
        return dtosAsc;
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

        // 멤버십 검증: 내가 속한 방만 허용
        List<String> authorized = memberRepo.findAuthorizedRoomIds(myUserId, roomIds);
        if (authorized.isEmpty()) return Collections.emptyList();

        // 최신 메시지 1건/방
        var rows = messageRepo.findLastMessagePerRoom(authorized);

        // DTO 매핑 (DB: DATETIME(6) → Timestamp → Instant)
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
