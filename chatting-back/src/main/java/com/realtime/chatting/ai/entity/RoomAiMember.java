package com.realtime.chatting.ai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "chat_room_ai_member")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class RoomAiMember {

    @EmbeddedId
    private RoomAiMemberId id;

    private Instant addedAt;
}
