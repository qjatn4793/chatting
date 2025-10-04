package com.realtime.chatting.chat.dto;
import java.time.Instant;
import java.util.UUID;

import lombok.*;
@Getter 
@Setter 
@NoArgsConstructor 
@AllArgsConstructor 
@Builder
public class MessageDto {
    private Long id;
    private String roomId;
    private UUID messageId;
    private String sender;
    private String username;
    private String content;
    private Instant createdAt;
}
