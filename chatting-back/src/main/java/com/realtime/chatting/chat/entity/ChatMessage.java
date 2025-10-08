package com.realtime.chatting.chat.entity;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(
        name = "chat_messages",
        indexes = {
                @Index(name="ix_chat_messages_message_id", columnList="message_id", unique = true),
                @Index(name="ix_chat_messages_room_created", columnList="room_id, created_at")
        }
)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // FK가 걸릴 대상이므로 unique 보장 필요
    @Column(name="message_id", nullable = false, length = 64, unique = true)
    private String messageId;

    @Column(name="room_id", nullable = false, length = 64)
    private String roomId;

    @Column(nullable = false, length = 60)
    private String sender;

    @Column(nullable = false, length = 60)
    private String username;

    @Column(nullable = false, length = 2000)
    private String content;

    @Column(name="created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}