package com.realtime.chatting.chat.controller;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.storage.service.AttachmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class ChatMessageController {

    private final AttachmentService attachmentService;

    @GetMapping("/messages/{messageId}")
    public ResponseEntity<MessageDto> getOne(@PathVariable String messageId) {
        MessageDto dto = attachmentService.findByMessageIdWithAttachments(messageId);
        return (dto == null) ? ResponseEntity.notFound().build() : ResponseEntity.ok(dto);
    }
}