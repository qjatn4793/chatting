package com.realtime.chatting.security;

import com.realtime.chatting.login.entity.User;
import io.jsonwebtoken.Claims;

import java.time.Instant;
import java.util.UUID;

public interface JwtProvider {
    String createAccessToken(User user);
    String createRefreshToken(User user);
    java.time.Instant getAccessTokenExpiry();

    java.util.UUID verifyAndExtractRefreshSubject(String refreshToken);

    /** 액세스 토큰의 클레임 파싱(서명+만료 검증 포함) */
    Claims parseAccessClaims(String accessToken);
}