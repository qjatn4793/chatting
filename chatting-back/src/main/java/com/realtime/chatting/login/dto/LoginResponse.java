package com.realtime.chatting.login.dto;

import java.time.Instant;

public record LoginResponse(
        String accessToken,
        String refreshToken,         // 리프레시를 쓰지 않으면 null로
        Instant expiresAt,           // 액세스 만료시각
        String userId,               // UUID 문자열
        String username,             // 실명
        String email,
        String phoneNumber,
        String profileImageUrl
) {}