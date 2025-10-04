package com.realtime.chatting.friend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FriendBriefDto {
    private String id;     // UUID 문자열 (선택)
    private String name;   // 화면 표시용 이름(닉네임 등)
    private String email;  // 로그인/식별용 이메일
}