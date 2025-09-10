package com.realtime.chatting.friend.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PresenceService {

    // Redis 미사용 환경에서도 동작하도록 optional
    @Autowired(required = false)
    private StringRedisTemplate redis;

    public boolean isOnline(String username) {
        if (redis == null) return false;
        try {
            String v = redis.opsForValue().get(key(username));
            return "1".equals(v);
        } catch (Exception e) {
            return false;
        }
    }

    public static String key(String username) {
        return "presence:online:" + username;
    }
}
