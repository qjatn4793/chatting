package com.realtime.chatting.chat.dto;

public record ChatNotify(
	    String roomId,
	    String sender,
	    String preview,   // 앞부분 50~80자 잘라 담기
	    long ts
) {}