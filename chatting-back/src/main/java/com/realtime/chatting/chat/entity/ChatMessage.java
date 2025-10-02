package com.realtime.chatting.chat.entity;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "chat_messages", indexes = { @Index(name="idx_room_created", columnList="room_id, createdAt") })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name="room_id", nullable = false, length = 40)
    private String roomId;

    @Column(nullable = false, length = 60)
    private String sender; // username

    @Column(nullable = false, length = 2000)
    private String content;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
