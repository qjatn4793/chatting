package com.realtime.chatting.ai.controller;

import com.realtime.chatting.ai.entity.RoomAiMember;
import com.realtime.chatting.ai.entity.RoomAiMemberId;
import com.realtime.chatting.ai.repository.AiAgentRepository;
import com.realtime.chatting.ai.repository.RoomAiMemberRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequiredArgsConstructor
public class RoomAiInviteController {
    private final RoomAiMemberRepository roomAiRepo;
    private final AiAgentRepository aiRepo;

    public record InviteReq(String agentId, List<String> agentIds) {}

    @PostMapping("/rooms/{roomId}/invite/ai")
    @Transactional
    public Map<String,Object> invite(@PathVariable String roomId, @RequestBody InviteReq req){
        // 단건/복수 모두 지원
        List<String> ids = new ArrayList<>();
        if (req.agentId() != null && !req.agentId().isBlank()) ids.add(req.agentId());
        if (req.agentIds() != null) ids.addAll(req.agentIds());

        if (ids.isEmpty()) throw new IllegalArgumentException("agentId(s) required");

        for (String agentId : ids) {
            aiRepo.findById(agentId).orElseThrow(() -> new IllegalArgumentException("Unknown agentId: " + agentId));
            var pk = new RoomAiMemberId(roomId, agentId);
            if (!roomAiRepo.existsById(pk)) {
                roomAiRepo.save(RoomAiMember.builder()
                        .id(pk)
                        .addedAt(Instant.now())
                        .build());
            }
        }
        return Map.of("ok", true, "count", ids.size());
    }
}