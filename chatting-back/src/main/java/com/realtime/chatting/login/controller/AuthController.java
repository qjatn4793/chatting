package com.realtime.chatting.login.controller;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import java.util.Date;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    // @Value 어노테이션을 사용하여 JWT 비밀 키를 읽어옵니다.
    @Value("${jwt.secret}")
    private String secretKey;

    // 회원가입 API
    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestBody User user) {
        if (userRepository.findByUsername(user.getUsername()) != null) {
            return new ResponseEntity<>("Username is already taken", HttpStatus.BAD_REQUEST);
        }

        user.setPassword(passwordEncoder.encode(user.getPassword())); // 비밀번호 해싱
        userRepository.save(user);
        return new ResponseEntity<>("User registered successfully", HttpStatus.CREATED);
    }

    // 로그인 API
    @PostMapping("/login")
    public ResponseEntity<String> login(@RequestBody User user) {
        User foundUser = userRepository.findByUsername(user.getUsername());

        // 사용자 이름과 비밀번호 확인
        if (foundUser != null && passwordEncoder.matches(user.getPassword(), foundUser.getPassword())) {
            // JWT 토큰에 만료 시간을 1시간으로 설정
            String token = Jwts.builder()
                    .setSubject(user.getUsername()) // 사용자 이름을 주제로 설정
                    .setExpiration(new Date(System.currentTimeMillis() + 3600000)) // 1시간 후 만료
                    .setIssuedAt(new Date()) // 토큰 발행 시간을 현재 시간으로 설정
                    .signWith(SignatureAlgorithm.HS256, secretKey)  // @Value로 읽어온 secretKey 사용
                    .compact();

            // 토큰을 성공적으로 생성하여 반환
            return ResponseEntity.ok(token);
        } else {
            // 사용자 인증 실패 시
            return new ResponseEntity<>("Invalid credentials", HttpStatus.UNAUTHORIZED);
        }
    }
}
