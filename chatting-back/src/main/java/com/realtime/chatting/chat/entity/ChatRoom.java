package com.realtime.chatting.chat.entity;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "chat_rooms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRoom {
    public enum Type { DM, GROUP }

    @Id @Column(length = 40)
    private String id; // UUID string

    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private Type type;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(length = 200)
    private String title;
}
