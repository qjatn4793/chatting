package com.realtime.chatting.ai.service;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.service.MessageService;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final MessageService messageService;

    @Async("aiExecutor")
    public CompletableFuture<List<String>> buildPromptAsync(String roomId) {
        // 최근 N개만 간단히 가져오거나, 필요 시 요약기를 붙이세요.
        List<MessageDto> recent = messageService.history(roomId, 20, null);
        // 아주 간단한 컨텍스트 예시
        String ctx = "Recent messages: " + Math.min(recent.size(), 20);
        return CompletableFuture.completedFuture(List.of(ctx));
    }
}
