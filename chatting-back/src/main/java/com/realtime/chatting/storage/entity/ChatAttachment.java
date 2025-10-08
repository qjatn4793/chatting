package com.realtime.chatting.storage.entity;

import com.realtime.chatting.chat.entity.ChatMessage;
import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Table(name = "chat_attachment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatAttachment {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ⬅️ 핵심: 참조 컬럼을 ChatMessage.message_id 로 지정
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", referencedColumnName = "message_id", nullable = false)
    private ChatMessage message;

    @Column(nullable = false, length = 512)
    private String storageKey;

    @Column(nullable = false, length = 512)
    private String publicUrl;

    @Column(length = 255)
    private String originalName;

    @Column(length = 100)
    private String contentType;

    private Long size;
    private Integer width;
    private Integer height;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
