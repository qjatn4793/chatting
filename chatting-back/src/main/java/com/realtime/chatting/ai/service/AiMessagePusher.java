package com.realtime.chatting.ai.service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.entity.ChatMessage;
import com.realtime.chatting.chat.repository.ChatMessageRepository;
import com.realtime.chatting.chat.service.ChatFanoutService;
import com.realtime.chatting.chat.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AiMessagePusher {
    private final ChatMessageRepository messageRepo;     // 엔티티 직접 저장
    private final ChatFanoutService chatFanoutService;   // 브로커 퍼블리시 비동기

    /**
     * AI 응답을 저장하고 브로커에 퍼블리시한다.
     * - 동기 저장(트랜잭션 경계는 호출자 컨텍스트에 따름)
     * - 브로커 퍼블리시는 @Async 로 비동기 실행
     */
    public void pushAiMessage(String roomId, String agentId, String displayName, String content){
        // 저장
        String messageId = UUID.randomUUID().toString();

        ChatMessage m = ChatMessage.builder()
                .roomId(roomId)
                .messageId(messageId)
                .sender(agentId)         // AI 내부 식별자
                .username(displayName)   // 화면 표기명
                .content(content)
                .createdAt(Instant.now())
                .build();

        ChatMessage saved = messageRepo.save(m);

        // 2) DTO 매핑 (AI 메시지는 첨부물 없음)
        MessageDto dto = MessageDto.builder()
                .id(saved.getId())
                .roomId(roomId)
                .messageId(UUID.fromString(messageId))
                .sender(agentId)
                .username(displayName)
                .content(content)
                .createdAt(saved.getCreatedAt())
                .attachments(List.of())
                .build();

        // 3) 브로커 퍼블리시 (비동기)
        chatFanoutService.publishToBrokerAsync(roomId, dto);
    }
}
