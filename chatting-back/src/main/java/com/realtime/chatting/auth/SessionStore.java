package com.realtime.chatting.auth;

public interface SessionStore {
	void setActiveSid(String username, String sid, long ttlMillis);
    String getActiveSid(String username);
}
