package com.realtime.chatting.storage.service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.entity.ChatMessage;
import com.realtime.chatting.chat.repository.ChatMessageRepository;
import com.realtime.chatting.chat.dto.AttachmentDto;
import com.realtime.chatting.storage.dto.StoredObject;
import com.realtime.chatting.storage.entity.ChatAttachment;
import com.realtime.chatting.storage.repository.ChatAttachmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AttachmentService {

    private final ChatMessageRepository messageRepo;
    private final ChatAttachmentRepository attachmentRepo;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public ChatAttachment saveForMessage(String messageId, StoredObject so) {
        ChatMessage msg = messageRepo.findByMessageId(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "message not found"));

        ChatAttachment ca = ChatAttachment.builder()
                .message(msg)
                .storageKey(so.getStorageKey())
                .publicUrl(so.getUrl())
                .originalName(so.getOriginalName())
                .contentType(so.getContentType())
                .size(so.getSize())
                .createdAt(Instant.now())
                .build();

        ChatAttachment saved = attachmentRepo.save(ca);

        broadcastUpdatedMessage(messageId);

        return saved;
    }

    @Transactional
    public List<ChatAttachment> saveForMessage(String messageId, List<StoredObject> files) {
        List<ChatAttachment> out = new ArrayList<>(files.size());
        for (StoredObject so : files) {
            out.add(saveForMessage(messageId, so));
        }
        return out;
    }

    private void broadcastUpdatedMessage(String messageId) {
        var dto = findByMessageIdWithAttachments(messageId);
        if (dto == null) return;
        // STOMP 주제: /topic/rooms/{roomId}
        messagingTemplate.convertAndSend("/topic/rooms/" + dto.getRoomId(), dto);
    }

    @Transactional(readOnly = true)
    public MessageDto findByMessageIdWithAttachments(String messageId) {
        ChatMessage m = messageRepo.findByMessageId(messageId).orElse(null);
        if (m == null) return null;

        List<ChatAttachment> atts = attachmentRepo.findByMessage_MessageIdOrderByIdAsc(messageId);

        List<AttachmentDto> attachmentDtos = atts.stream()
                .sorted(Comparator.comparing(ChatAttachment::getId))
                .map(a -> AttachmentDto.builder()
                        .id(a.getId())
                        .storageKey(a.getStorageKey())
                        .url(a.getPublicUrl())
                        .size(a.getSize())
                        .contentType(a.getContentType())
                        .originalName(a.getOriginalName())
                        .width(a.getWidth())
                        .height(a.getHeight())
                        .createdAt(a.getCreatedAt())
                        .build())
                .collect(Collectors.toList());

        return MessageDto.builder()
                .id(m.getId()) // 엔티티 PK 이름이 다르면 맞춰주세요(getPk 등)
                .messageId(m.getMessageId() != null ? UUID.fromString(m.getMessageId()) : null)
                .roomId(m.getRoomId())
                .sender(m.getSender())
                .username(m.getUsername())
                .content(m.getContent())
                .createdAt(m.getCreatedAt())
                .attachments(attachmentDtos)
                .build();
    }
}