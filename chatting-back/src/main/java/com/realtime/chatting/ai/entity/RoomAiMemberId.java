package com.realtime.chatting.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode  // JPA 키 클래스는 동치성 구현 필수
public class RoomAiMemberId implements Serializable {

    @Column(length = 64, nullable = false)
    private String roomId;

    @Column(length = 64, nullable = false)
    private String agentId;
}
