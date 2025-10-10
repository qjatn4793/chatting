package com.realtime.chatting.ai.dto;

public record AiAgentDto(
        String id,
        String name,
        String intro,
        String[] tags,
        String avatarUrl
) {}
