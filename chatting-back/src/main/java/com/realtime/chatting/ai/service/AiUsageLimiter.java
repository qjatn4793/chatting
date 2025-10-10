package com.realtime.chatting.ai.service;

import org.springframework.stereotype.Component;

import java.time.*;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 초기에는 In-Memory로. 운영 전환 시 Redis로 교체 권장 */
@Component
public class AiUsageLimiter {
    private static final long COOLDOWN_MS = 2500L;    // 2.5초
    private static final int DAILY_CALLS_LIMIT = 200; // 룸/에이전트/일

    private final Map<String, Long> lastCallAt = new ConcurrentHashMap<>();
    private final Map<String, Integer> todayCalls = new ConcurrentHashMap<>();
    private LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

    public boolean allow(String roomId, String agentId) {
        rotateIfDayChanged();
        String key = key(roomId, agentId);
        long now = System.currentTimeMillis();

        Long last = lastCallAt.get(key);
        if (last != null && now - last < COOLDOWN_MS) return false;

        int calls = todayCalls.getOrDefault(key, 0);
        return calls < DAILY_CALLS_LIMIT;
    }

    public void onConsume(String roomId, String agentId) {
        rotateIfDayChanged();
        String key = key(roomId, agentId);
        lastCallAt.put(key, System.currentTimeMillis());
        todayCalls.merge(key, 1, Integer::sum);
    }

    private void rotateIfDayChanged() {
        LocalDate now = LocalDate.now(ZoneId.of("Asia/Seoul"));
        if (!now.equals(today)) {
            today = now;
            todayCalls.clear();
        }
    }
    private static String key(String roomId, String agentId) { return roomId + ":" + agentId; }
}
