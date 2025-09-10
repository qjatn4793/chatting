package com.realtime.chatting.chat.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/debug")
@RequiredArgsConstructor
public class WsDebugController {

    private final SimpMessagingTemplate template;

    @GetMapping("/ping/{roomId}")
    public Map<String, Object> ping(@PathVariable String roomId) {
        Map<String, Object> payload = Map.of(
                "id", -1L,
                "roomId", roomId,
                "sender", "system",
                "content", "ping",
                "createdAt", Instant.now().toString()
        );
        // 프론트 구독 경로와 반드시 동일
        template.convertAndSend("/topic/rooms/" + roomId, payload);
        return payload;
    }
}
