package com.realtime.chatting.auth;

import java.time.Duration;

import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@Primary // 같은 타입(InMemory 등)과 충돌 시 Redis 구현을 기본으로 사용
@RequiredArgsConstructor
public class RedisSessionStore implements SessionStore {

	private final StringRedisTemplate redis;
    private static final String KEY_FMT = "active:sid:%s";

    @Override
    public void setActiveSid(String username, String sid, long ttlMillis) {
        String key = KEY(username);
        redis.opsForValue().set(key, sid, Duration.ofMillis(ttlMillis));
    }

    @Override
    public String getActiveSid(String username) {
        return redis.opsForValue().get(KEY(username));
    }

    private static String KEY(String username) {
        return String.format(KEY_FMT, username);
    }
}
