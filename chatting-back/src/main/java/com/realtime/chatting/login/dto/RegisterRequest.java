package com.realtime.chatting.login.dto;

import jakarta.validation.constraints.*;

import java.time.LocalDate;

public record RegisterRequest(
        /** 실명(표시용 이름) */
        @NotBlank @Size(min = 2, max = 100)
        String username,

        @Email @NotBlank @Size(min = 2, max = 100)
        String email,

        /** 원문 비밀번호(서버에서 해시) */
        @NotBlank @Size(min = 8, max = 100)
        String password,

        /** 휴대폰 번호 (정책에 맞춰 정규식 조정) */
        @Pattern(regexp = "^[0-9\\-+]{9,20}$",
                message = "휴대폰 번호 형식이 올바르지 않습니다.")
        String phoneNumber,

        /** 생년월일 (과거 날짜) */
        @Past(message = "생년월일은 과거 날짜여야 합니다.")
        LocalDate birthDate
) {}