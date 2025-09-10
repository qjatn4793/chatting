package com.realtime.chatting.chat.dto;
import java.time.Instant;
import lombok.*;
@Getter 
@Setter 
@NoArgsConstructor 
@AllArgsConstructor 
@Builder
public class MessageDto {
    private Long id;
    private String roomId;
    private String sender;
    private String content;
    private Instant createdAt;
}
