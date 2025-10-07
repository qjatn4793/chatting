package com.realtime.chatting.security;

import com.realtime.chatting.login.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec; // Keys 대신 직접 생성
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtProviderImpl implements JwtProvider {

    private static final String HMAC_ALG = "HmacSHA256"; // HS256 기준
    private final SecretKey accessKey;
    private final SecretKey refreshKey;
    private final long accessExpMs;
    private final long refreshExpMs;

    public JwtProviderImpl(
            @Value("${jwt.secret}") String accessSecret,
            @Value("${jwt.secret-base64:false}") boolean accessBase64,
            @Value("${jwt.expiration-ms}") long accessExpMs,
            @Value("${jwt.refresh-secret:${jwt.secret}}") String refreshSecret,
            @Value("${jwt.refresh-secret-base64:${jwt.secret-base64:false}}") boolean refreshBase64,
            @Value("${jwt.refresh-expiration-ms}") long refreshExpMs
    ) {
        byte[] aBytes = accessBase64
                ? Base64.getDecoder().decode(accessSecret)
                : accessSecret.getBytes(StandardCharsets.UTF_8);
        byte[] rBytes = refreshBase64
                ? Base64.getDecoder().decode(refreshSecret)
                : refreshSecret.getBytes(StandardCharsets.UTF_8);

        if (aBytes.length < 32 || rBytes.length < 32) {
            throw new IllegalArgumentException("JWT secret length must be >= 32 bytes (256 bits).");
        }

        // Keys.hmacShaKeyFor(...) 제거: KeysBridge 로딩 회피
        this.accessKey  = new SecretKeySpec(aBytes,  HMAC_ALG);
        this.refreshKey = new SecretKeySpec(rBytes, HMAC_ALG);

        this.accessExpMs = accessExpMs;
        this.refreshExpMs = refreshExpMs;
    }

    @Override
    public String createAccessToken(User user) {
        Instant now = Instant.now();
        Instant exp = now.plusMillis(accessExpMs);
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("name", user.getUsername())
                .claim("email", user.getEmail())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(accessKey) // 0.12.x: 알고리즘은 키에서 유추(HS256)
                .compact();
    }

    @Override
    public String createRefreshToken(User user) {
        Instant now = Instant.now();
        Instant exp = now.plusMillis(refreshExpMs);
        return Jwts.builder()
                .subject(user.getId().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(refreshKey)
                .compact();
    }

    @Override
    public Instant getAccessTokenExpiry() {
        return Instant.now().plusMillis(accessExpMs);
    }

    @Override
    public UUID verifyAndExtractRefreshSubject(String refreshToken) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(refreshKey)   // 0.12.x
                    .build()
                    .parseSignedClaims(refreshToken)
                    .getPayload();
            return UUID.fromString(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            throw new SecurityException("Invalid refresh token", e);
        }
    }

    @Override
    public Claims parseAccessClaims(String accessToken) {
        try {
            return Jwts.parser()
                    .verifyWith(accessKey)   // 0.12.x
                    .build()
                    .parseSignedClaims(accessToken)
                    .getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            throw new SecurityException("Invalid access token", e);
        }
    }
}
