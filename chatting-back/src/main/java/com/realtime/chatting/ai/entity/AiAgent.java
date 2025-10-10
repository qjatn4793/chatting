// src/main/java/com/realtime/chatting/ai/entity/AiAgent.java
package com.realtime.chatting.ai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Table(name = "ai_agent")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class AiAgent {
    @Id
    @Column(length = 64)
    private String id;

    @Column(length = 100, nullable = false)
    private String name;

    @Column(length = 500)
    private String intro;

    @Column(length = 255)
    private String tags; // comma-separated

    @Column(length = 512)
    private String avatarUrl;

    @Lob
    private String systemPrompt;

    private Double temperature;
    private Double topP;

    private Instant createdAt;
}
