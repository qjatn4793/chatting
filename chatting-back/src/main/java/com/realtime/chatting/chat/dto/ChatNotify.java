// src/main/java/com/realtime/chatting/chat/dto/ChatNotify.java
package com.realtime.chatting.chat.dto;

import lombok.*;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatNotify {
    /** MESSAGE | UNREAD_INC | UNREAD_SET ... */
    private String type;

    private String roomId;

    /** 발신자 식별자(가능하면 UUID 문자열) */
    private String senderUserId; // 프론트에서 sameId 비교에 쓰임

    /** 백워드 호환용(있으면 같이 보냄) */
    private String sender;

    /** 화면에 표시할 라벨(닉네임/이메일/표시명 등) */
    private String username;

    /** 메시지 원문(짧게 보내려면 preview만 사용 가능) */
    private String content;

    /** 요약 본문(프론트가 content/preview 둘 다 수용하므로 편한 쪽 사용) */
    private String preview;

    /** epoch millis */
    private Long createdAt;

    /** 선택: 안읽음 증분/절대값이 필요한 경우 */
    private Integer delta;
    private Integer unread;
}