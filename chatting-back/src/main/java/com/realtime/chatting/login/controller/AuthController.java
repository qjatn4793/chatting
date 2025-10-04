package com.realtime.chatting.login.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.realtime.chatting.login.dto.LoginRequest;
import com.realtime.chatting.login.dto.LoginResponse;
import com.realtime.chatting.login.dto.RegisterRequest;
import com.realtime.chatting.login.service.AuthService;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * 회원가입 (버전1): multipart/form-data
     *  - data: application/json (RegisterRequest)
     *  - profile: image/* (optional)
     *
     * 호출 경로는 기존과 동일: POST /auth/register  (또는 /register)
     */
    @PostMapping(
            value = "/register",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> registerMultipart(
            @RequestPart("data") @Valid RegisterRequest data,
            @RequestPart(value = "profile", required = false) MultipartFile profile
    ) {
        authService.register(data, profile);  // 프로필 파일 포함 버전
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    /**
     * 회원가입 (버전2): application/json
     *  - 기존 클라이언트 호환용 (프로필 이미지는 나중에 별도 업로드)
     *
     * 호출 경로는 기존과 동일: POST /auth/register  (또는 /register)
     */
    @PostMapping(
            value = "/register",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Void> registerJson(
            @Valid @RequestBody RegisterRequest req
    ) {
        authService.register(req, null);      // 파일 없이 처리
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    /**
     * 로그인: application/json
     *  - LoginRequest.identifier 에 이메일 또는 휴대폰(E.164) 전송
     *  - password: 그대로
     *
     * 호출 경로는 기존과 동일: POST /auth/login  (또는 /login)
     */
    @PostMapping(
            value = "/login",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest req
    ) {
        return ResponseEntity.ok(authService.login(req));
    }
}