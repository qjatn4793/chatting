package com.realtime.chatting.config;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.realtime.chatting.auth.SessionStore;
import com.realtime.chatting.security.JwtProvider; // ✅ JwtService 대신

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class JWTAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;     // ✅ 교체
    private final SessionStore sessionStore;   // 싱글세션(선택)

    private static final String BEARER = "Bearer ";

    /** 인증이 필요 없는 경로는 필터를 아예 건너뜁니다. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String p = request.getServletPath();
        return p.startsWith("/api/auth/")       // 로그인/회원가입/리프레시 등
                || p.startsWith("/chat/")           // SockJS/STOMP 엔드포인트
                || p.startsWith("/static/profile/") // 정적 프로필
                || "OPTIONS".equalsIgnoreCase(request.getMethod()); // CORS preflight
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        String h = req.getHeader(HttpHeaders.AUTHORIZATION);
        if (h != null && h.startsWith(BEARER)) {
            String token = h.substring(BEARER.length());
            try {
                // ✅ 액세스 토큰 검증 + 클레임 파싱
                Claims c = jwtProvider.parseAccessClaims(token);

                // 0.12.x 구현에서 subject는 "내부 PK(UUID 문자열)"
                String userId = c.getSubject();

                // 선택: 싱글세션 강제용 sid 클레임(없으면 스킵)
                String sid = c.get("sid", String.class);
                if (sid != null) {
                    String activeSid = sessionStore.getActiveSid(userId);
                    if (activeSid == null || !sid.equals(activeSid)) {
                        // 이전/무효 토큰: 인증 세팅 안 함 (보호 리소스 접근 시 401)
                        res.setHeader("X-Session-Expired", "true");
                        chain.doFilter(req, res);
                        return;
                    }
                }

                // 이미 컨텍스트가 세팅되지 않았다면 인증 객체 주입
                if (SecurityContextHolder.getContext().getAuthentication() == null) {
                    // 필요하면 GrantedAuthority 채워 넣으세요.
                    var auth = new UsernamePasswordAuthenticationToken(userId, null, List.of());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (SecurityException e) {
                log.warn("Invalid JWT(access): {}", e.getMessage());
                // 그냥 통과 → 보호 리소스면 이후 체인에서 401 처리됨
            } catch (Exception e) {
                log.error("JWT filter error", e);
            }
        }
        chain.doFilter(req, res);
    }
}
