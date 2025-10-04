package com.realtime.chatting.login.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Getter
@Setter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class User {

    /** 로그인 및 시스템 식별자 (아이디) */
    @Id
    @Column(columnDefinition = "BINARY(16)")
    private UUID id;

    @Column(length = 191)
    private String email;

    /** 실명(표시용) */
    @Column(name = "username", length = 100, nullable = false)
    private String username;

    /** 해시된 비밀번호 */
    @Column(name = "password", nullable = false)
    private String password;

    /** 휴대폰 번호 (숫자/하이픈 혼용 허용) */
    @Column(name = "phone_number", length = 32)
    private String phoneNumber;

    /** 생년월일 */
    @Column(name = "birth_date")
    private LocalDate birthDate;

    /** 프로필 이미지의 URL (또는 경로) */
    @Column(name = "profile_image_url", length = 512)
    private String profileImageUrl;

    @CreationTimestamp
    @Column(updatable = false)
    private java.time.LocalDateTime createdAt;

    @UpdateTimestamp
    private java.time.LocalDateTime updatedAt;
}