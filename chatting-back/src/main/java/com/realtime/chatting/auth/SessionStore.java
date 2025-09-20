package com.realtime.chatting.auth;

public interface SessionStore {
	void setActiveSid(String username, String sid, long ttlMillis);
	
    String getActiveSid(String username);
    
    /** 현재 활성 sid와 같은지 여부 (없으면 false) */
    default boolean isActiveSid(String username, String sid) {
        String active = getActiveSid(username);
        return active != null && active.equals(sid);
    }
}
