package com.realtime.chatting.chat.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

public record InviteRequest(
        @NotNull List<String> identifiers
) {}