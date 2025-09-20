package com.realtime.chatting.login.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.realtime.chatting.auth.SessionStore;
import com.realtime.chatting.login.dto.LoginRequest;
import com.realtime.chatting.login.dto.LoginResponse;
import com.realtime.chatting.login.dto.RegisterRequest;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final SessionStore sessionStore;
    private final SimpMessagingTemplate messagingTemplate; // 실시간 킥용

    public void register(RegisterRequest req) {
        Optional<User> existing = userRepository.findByUsername(req.username());
        if (existing.isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already taken");
        }
        User u = new User();
        u.setUsername(req.username());
        u.setPassword(passwordEncoder.encode(req.password()));
        userRepository.save(u);
    }

    public LoginResponse login(LoginRequest req) {
        User user = userRepository.findByUsername(req.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        
        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        // 새 세션 식별자 발급 & 서버 저장 (TTL = 액세스 토큰 만료와 동일)
        String sid = UUID.randomUUID().toString();
        sessionStore.setActiveSid(user.getUsername(), sid, jwtService.getExpirationMs());

        // 기존 접속 브라우저에 STOMP로 킥 메시지
        try {
            messagingTemplate.convertAndSendToUser(user.getUsername(), "/queue/kick", "KICK");
        } catch (Exception ignored) {}

        String token = jwtService.issue(user.getUsername(), sid);
        return new LoginResponse(token, jwtService.getExpirationMs());
    }
}