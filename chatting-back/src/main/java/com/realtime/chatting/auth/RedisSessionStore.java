package com.realtime.chatting.auth;

import java.time.Duration;

import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

@Component
@Primary // 같은 타입의 다른 구현과 충돌 시 Redis 구현을 기본으로 사용
@RequiredArgsConstructor
public class RedisSessionStore implements SessionStore {

    private final StringRedisTemplate redis;
    private static final String KEY_FMT = "active:sid:%s"; // %s = userId(UUID)

    private static String key(String userId) {
        return String.format(KEY_FMT, userId);
    }

    /* ===== userId 기반 구현 ===== */

    @Override
    public void setActiveSidByUserId(String userId, String sid, long ttlMillis) {
        redis.opsForValue().set(key(userId), sid, Duration.ofMillis(ttlMillis));
    }

    @Override
    public String getActiveSidByUserId(String userId) {
        return redis.opsForValue().get(key(userId));
    }

    @Override
    public void clearActiveSidByUserId(String userId) {
        redis.delete(key(userId));
    }

    /* ===== 하위호환(username) 메서드는 SessionStore의 default 구현에 위임하므로 별도 코드 불필요 ===== */
}
