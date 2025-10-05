package com.realtime.chatting.login.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import com.realtime.chatting.common.Normalizer;
import com.realtime.chatting.security.JwtProvider;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.realtime.chatting.login.dto.LoginRequest;
import com.realtime.chatting.login.dto.LoginResponse;
import com.realtime.chatting.login.dto.RegisterRequest;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private final Normalizer normalizer;
    private final JwtProvider jwtProvider;

    private final Path uploadRoot = Paths.get("uploads/profile");

    // ============================ 회원가입 영역 ======================================
    public UUID register(RegisterRequest req, MultipartFile profile) {
        String email = normalizer.normalizeEmail(req.email());
        String phone = normalizer.normalizePhone(req.phoneNumber());

        if (phone == null || phone.isBlank()) {
            throw new IllegalArgumentException("휴대폰 번호는 필수입니다.");
        }
        if ((email == null || email.isBlank())) {
            throw new IllegalArgumentException("이메일은 필수입니다.");
        }
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }
        if (userRepository.existsByPhoneNumber(phone)) {
            throw new IllegalArgumentException("이미 사용 중인 휴대폰 번호입니다.");
        }

        String imageUrl = null;
        if (profile != null && !profile.isEmpty()) {
            imageUrl = saveProfileImage(profile);
        }

        User user = User.builder()
                .id(UUID.randomUUID())
                .username(req.username())
                .email(email)
                .phoneNumber(phone)
                .password(passwordEncoder.encode(req.password()))
                .birthDate(req.birthDate())
                .profileImageUrl(imageUrl)
                .build();

        return userRepository.save(user).getId();
    }

    private String saveProfileImage(MultipartFile file) {
        try {
            Files.createDirectories(uploadRoot);
            String ext = "";
            String name = file.getOriginalFilename();
            if (name != null && name.contains(".")) ext = name.substring(name.lastIndexOf('.'));
            String fname = UUID.randomUUID() + ext;
            Path dest = uploadRoot.resolve(fname);
            file.transferTo(dest.toFile());
            return "/static/profile/" + fname;
        } catch (Exception e) {
            throw new RuntimeException("프로필 이미지 저장 실패", e);
        }
    }
    // ============================ 회원가입 영역 ======================================

    // ============================ 로그인 영역 =======================================
    public LoginResponse login(LoginRequest req) {
        User user = findForLogin(req)
                .orElseThrow(() -> new IllegalArgumentException("아이디(이메일/휴대폰) 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            // 필요하면 지연/락아웃 정책 추가
            throw new IllegalArgumentException("아이디(이메일/휴대폰) 또는 비밀번호가 올바르지 않습니다.");
        }

        String access = jwtProvider.createAccessToken(user);
        String refresh = jwtProvider.createRefreshToken(user); // 리프레시 안 쓰면 null 반환하게 구현
        Instant exp = jwtProvider.getAccessTokenExpiry();

        return new LoginResponse(
                access,
                refresh,
                exp,
                user.getId().toString(),
                user.getUsername(),
                user.getEmail(),
                user.getPhoneNumber(),
                user.getProfileImageUrl()
        );
    }

    public Optional<User> findForLogin(LoginRequest req) {
        String raw = req.identifier().trim();
        if (normalizer.looksLikeEmail(raw)) {
            return userRepository.findByEmail(normalizer.normalizeEmail(raw));
        } else {
            return userRepository.findByPhoneNumber(normalizer.normalizePhone(raw));
        }
    }
}