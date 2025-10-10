package com.realtime.chatting.ai.controller;

import com.realtime.chatting.ai.dto.AiAgentDto;
import com.realtime.chatting.ai.entity.AiAgent;
import com.realtime.chatting.ai.repository.AiAgentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/ai/agents")
@RequiredArgsConstructor
public class AiAgentController {
    private final AiAgentRepository repo;

    @GetMapping
    public Page<AiAgentDto> search(
            @RequestParam(required=false) String query,
            @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="12") int size
    ){
        Page<AiAgent> p = repo.search(query, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return p.map(a -> new AiAgentDto(
                a.getId(),
                a.getName(),
                a.getIntro(),
                a.getTags() == null ? new String[0] : a.getTags().split("\\s*,\\s*"),
                a.getAvatarUrl()
        ));
    }
}
