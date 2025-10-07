package com.realtime.chatting.chat.dto;

import java.util.UUID;

public record UnreadRoomDto(UUID roomId, long count) {}