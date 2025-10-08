package com.realtime.chatting.chat.dto;

import java.util.List;

public record InviteResponse(
        List<String> invited,
        List<String> alreadyMembers,
        List<String> notFound,
        List<String> failed
) {}