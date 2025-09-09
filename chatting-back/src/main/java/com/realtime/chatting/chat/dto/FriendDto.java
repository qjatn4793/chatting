package com.realtime.chatting.chat.dto;
import lombok.*;
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FriendDto {
    private String username;
    private String displayName;
    private boolean online;
}
