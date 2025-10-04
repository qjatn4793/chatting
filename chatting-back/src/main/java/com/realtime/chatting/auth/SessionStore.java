package com.realtime.chatting.auth;

import java.time.Duration;
import java.util.Objects;

/**
 * 사용자별 활성 세션 SID 저장소.
 * key = userId(UUID 문자열), value = sid
 */
public interface SessionStore {

    /* ===== 권장: userId 기반 API ===== */

    /** userId의 활성 sid를 ttl 동안 설정/갱신 */
    void setActiveSidByUserId(String userId, String sid, long ttlMillis);

    /** 편의 오버로드: Duration 사용 */
    default void setActiveSidByUserId(String userId, String sid, Duration ttl) {
        Objects.requireNonNull(ttl, "ttl");
        setActiveSidByUserId(userId, sid, ttl.toMillis());
    }

    /** userId의 현재 활성 sid 조회 (없으면 null) */
    String getActiveSidByUserId(String userId);

    /** 현재 활성 sid와 같은지 여부 (없으면 false) */
    default boolean isActiveSidByUserId(String userId, String sid) {
        String active = getActiveSidByUserId(userId);
        return active != null && active.equals(sid);
    }

    /** 명시적 로그아웃/강제 종료 시 호출(선택 구현) */
    default void clearActiveSidByUserId(String userId) {
        // 구현체에서 필요 시 오버라이드
    }

    /* ===== 하위호환: username 기반 (Deprecated) ===== */
    /** @deprecated userId 기반으로 마이그레이션 하세요. */
    @Deprecated
    default void setActiveSid(String username, String sid, long ttlMillis) {
        // 과거 코드가 username 변수명을 쓰더라도 사실상 userId로 전달하도록 맞추면 안전
        setActiveSidByUserId(username, sid, ttlMillis);
    }

    /** @deprecated userId 기반으로 마이그레이션 하세요. */
    @Deprecated
    default String getActiveSid(String username) {
        return getActiveSidByUserId(username);
    }

    /** @deprecated userId 기반으로 마이그레이션 하세요. */
    @Deprecated
    default boolean isActiveSid(String username, String sid) {
        return isActiveSidByUserId(username, sid);
    }
}
