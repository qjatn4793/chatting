package com.realtime.chatting.chat.entity;

import jakarta.persistence.*;
import lombok.*;
import com.realtime.chatting.login.entity.User;

@Entity
@Table(name = "chat_room_members",
       uniqueConstraints = @UniqueConstraint(name = "uk_room_user", columnNames = {"room_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRoomMember {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "room_id", nullable = false)
    private ChatRoom room;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(name = "unread_count", nullable = false)
    private int unreadCount;

    // JPA가 INSERT 시 자동으로 현재 시각 채움
    @Column(name = "joined_at", nullable = false, updatable = false)
    @org.hibernate.annotations.CreationTimestamp
    private java.time.Instant joinedAt;

    // 혹시 CreationTimestamp가 적용 안 되는 환경 대비 안전장치
    @PrePersist
    void prePersist() {
        if (joinedAt == null) joinedAt = java.time.Instant.now();
    }
}
