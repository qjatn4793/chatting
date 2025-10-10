package com.realtime.chatting.chat.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

import com.realtime.chatting.ai.service.AiChatService;
import com.realtime.chatting.chat.dto.AttachmentDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.storage.repository.ChatAttachmentRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.lang.Nullable;
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
    public List<MessageDto> history(String roomId, int limit, @Nullable Instant before) {
        int capped = Math.min(200, Math.max(1, limit));

        // DESC(최신 먼저), tie-breaker로 id도 같이 정렬하여 안정화
        var sort = Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id"));
        var page = PageRequest.of(0, capped, sort);

        // 커서 유무로 분기
        List<ChatMessage> msgsDesc = (before == null)
                ? messageRepo.findByRoomIdOrderByCreatedAtDesc(roomId, page)
                : messageRepo.findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(roomId, before, page);

        if (msgsDesc.isEmpty()) return List.of();

        // messageId 목록 뽑기
        List<String> mids = msgsDesc.stream()
                .map(ChatMessage::getMessageId)
                .filter(Objects::nonNull)
                .toList();

        // 첨부 한 방에 IN 조회 -> messageId로 그룹핑
        Map<String, List<AttachmentDto>> grouped = mids.isEmpty()
                ? Collections.emptyMap()
                : attachmentRepo.findByMessage_MessageIdInOrderByIdAsc(mids)
                .stream()
                .collect(Collectors.groupingBy(
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
                                .build(), Collectors.toList()
                        )
                ));

        // DTO 매핑 (현재 msgsDesc는 DESC)
        List<MessageDto> dtosDesc = msgsDesc.stream().map(m -> MessageDto.builder()
                .id(m.getId())
                .roomId(m.getRoomId())
                // 엔티티가 String이라면 안전 파싱(잘못된 값 방지)
                .messageId(parseUuidSafe(m.getMessageId()))
                .sender(m.getSender())
                .username(m.getUsername())
                .content(m.getContent())
                .createdAt(m.getCreatedAt())
                .attachments(grouped.getOrDefault(m.getMessageId(), List.of()))
                .build()
        ).toList();

        // 프론트가 과거→현재(ASC)로 그리므로 뒤집어서 반환
        List<MessageDto> dtosAsc = new ArrayList<>(dtosDesc);
        dtosAsc.sort(Comparator.comparing(MessageDto::getCreatedAt));
        return dtosAsc;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //    "사람"이 보낸 메시지 저장 + 이벤트 발행 (AI 트리거)
    //    - messageId는 서버에서 생성(UUID)
    // ─────────────────────────────────────────────────────────────────────────────
    @Transactional
    public MessageDto createUserMessage(String roomId, String messageId, String username, String sender, String content) {

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
                .messageId(UUID.fromString(messageId))
                .sender(sender)
                .username(username)
                .content(content)
                .createdAt(m.getCreatedAt())
                .build();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //    "AI"가 보낸 메시지 저장 (이벤트 발행 없음)
    //    - agentId: 내부 식별자(예: 'ai_eng_tutor'), displayName: 사용자가 볼 이름
    // ─────────────────────────────────────────────────────────────────────────────
    @Transactional
    public MessageDto createAiMessage(String roomId, String agentId, String displayName, String content) {
        String messageId = UUID.randomUUID().toString();

        ChatMessage m = ChatMessage.builder()
                .roomId(roomId)
                .messageId(messageId)
                .sender(agentId)          // sender에 agentId 저장
                .username(displayName)    // 표시명
                .content(content)
                .createdAt(Instant.now())
                .build();

        m = messageRepo.save(m);

        return MessageDto.builder()
                .id(m.getId())
                .roomId(roomId)
                .messageId(UUID.fromString(messageId))
                .sender(agentId)
                .username(displayName)
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
