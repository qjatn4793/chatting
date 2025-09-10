package com.realtime.chatting.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
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
import com.realtime.chatting.login.service.JwtService;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class JWTAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final SessionStore sessionStore;
    private static final String BEARER = "Bearer ";

    /** 인증이 필요 없는 경로는 필터를 아예 건너뜁니다. */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String p = request.getServletPath();
        return p.startsWith("/api/auth/")   // 로그인/회원가입
            || p.startsWith("/chat/")       // SockJS 엔드포인트 등
            || "OPTIONS".equalsIgnoreCase(request.getMethod()); // CORS preflight
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        String h = req.getHeader(HttpHeaders.AUTHORIZATION);
        if (h != null && h.startsWith(BEARER)) {
            String token = h.substring(BEARER.length());
            try {
                Jws<Claims> jws = jwtService.parse(token);
                Claims c = jws.getBody();
                String username = c.getSubject();
                String sid = c.get("sid", String.class);

                String activeSid = sessionStore.getActiveSid(username);
                if (activeSid == null || !activeSid.equals(sid)) {
                    // 이전/무효 토큰: 인증 세팅 안 함 (보호 리소스 접근 시 401)
                    res.setHeader("X-Session-Expired", "true");
                } else if (SecurityContextHolder.getContext().getAuthentication() == null) {
                    var auth = new UsernamePasswordAuthenticationToken(username, null, List.of());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (JwtException e) {
                log.warn("Invalid JWT: {}", e.getMessage());
            }
        }
        chain.doFilter(req, res);
    }
}
