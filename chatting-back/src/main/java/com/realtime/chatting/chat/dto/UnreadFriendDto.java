package com.realtime.chatting.chat.dto;

import java.util.UUID;

public record UnreadFriendDto(UUID peerId, int count) {}