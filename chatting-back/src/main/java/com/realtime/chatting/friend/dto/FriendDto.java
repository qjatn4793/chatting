package com.realtime.chatting.friend.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FriendDto {
    private String username;
    private boolean online;
}
