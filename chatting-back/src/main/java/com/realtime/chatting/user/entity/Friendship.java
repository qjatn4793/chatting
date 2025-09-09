package com.realtime.chatting.user.entity;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "friendships", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id","friend_id"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Friendship {
    public enum Status { PENDING, ACCEPTED, BLOCKED }

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false)
    private com.realtime.chatting.login.entity.User user;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "friend_id", nullable = false)
    private com.realtime.chatting.login.entity.User friend;

    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private Status status;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
