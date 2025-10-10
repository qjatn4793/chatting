package com.realtime.chatting.ai.service;

import com.realtime.chatting.ai.entity.AiAgent;
import com.realtime.chatting.ai.entity.RoomAiMember;
import com.realtime.chatting.ai.repository.AiAgentRepository;
import com.realtime.chatting.ai.repository.RoomAiMemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiChatService {

    private final RoomAiMemberRepository roomAiRepo;
    private final AiAgentRepository agentRepo;
    private final LLMClient llm;
    private final AiUsageLimiter limiter;
    private final AiMessagePusher pusher;
    private final ConversationService conversationService;

    @Async("aiExecutor")
    public void onHumanMessage(String roomId, String rawMessage) {
        List<RoomAiMember> aiMembers = roomAiRepo.findByIdRoomId(roomId);
        if (aiMembers.isEmpty()) return;

        // 최근 히스토리/요약을 비동기로 준비 (선택)
        CompletableFuture<List<String>> historyFut = conversationService.buildPromptAsync(roomId);

        for (RoomAiMember m : aiMembers) {
            AiAgent a = agentRepo.findById(m.getId().getAgentId()).orElse(null);
            if (a == null) continue;
            respondWithAgent(roomId, a, rawMessage, historyFut);
        }
    }

    @Async("aiExecutor") // 에이전트별 병렬 응답
    public void respondWithAgent(String roomId, AiAgent a, String rawMessage,
                                 CompletableFuture<List<String>> historyFut) {
        if (!limiter.allow(roomId, a.getId())) return;

        List<String> history = List.of();
        try {
            history = historyFut.get(2, TimeUnit.SECONDS); // 너무 오래 기다리지 않게
        } catch (Exception ignore) {}

        try {
            String reply = llm.complete(
                    a.getSystemPrompt(), history, rawMessage, a.getTemperature(), a.getTopP());

            if (reply != null && !reply.isBlank()) {
                pusher.pushAiMessage(roomId, a.getId(), a.getName(), reply);
                limiter.onConsume(roomId, a.getId());
            }
        } catch (Exception e) {
            log.warn("AI respond failed: room={} agent={} err={}", roomId, a.getId(), e.toString());
        }
    }
}
