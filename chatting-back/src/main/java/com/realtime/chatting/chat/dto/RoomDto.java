package com.realtime.chatting.chat.dto;
import java.time.Instant;
import java.util.List;
import lombok.*;
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomDto {
    private String id;
    private String type;
    private Instant createdAt;
    private List<String> members;
    private String title;
}
