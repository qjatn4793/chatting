package com.realtime.chatting.storage.repository;

import com.realtime.chatting.storage.entity.ChatAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatAttachmentRepository extends JpaRepository<ChatAttachment, Long> {
    List<ChatAttachment> findByMessage_MessageIdOrderByIdAsc(String messageId);

    List<ChatAttachment> findByMessage_MessageIdInOrderByIdAsc(List<String> messageIds);
}
