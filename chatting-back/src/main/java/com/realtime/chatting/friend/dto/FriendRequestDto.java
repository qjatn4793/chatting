package com.realtime.chatting.friend.dto;

import com.realtime.chatting.friend.model.FriendRequestStatus;

import java.time.Instant;

public record FriendRequestDto(
        Long id,
        String requester,
        String receiver,
        FriendRequestStatus status,
        Instant createdAt
) {}
