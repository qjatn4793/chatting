package com.realtime.chatting.login.dto;

public record LoginResponse (
	String token,
    long expiresInMs
) {}
