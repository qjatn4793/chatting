package com.realtime.chatting.config;

import com.realtime.chatting.auth.SessionStore;
import com.realtime.chatting.security.JwtProvider;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.Collections;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtStompInterceptor implements ChannelInterceptor {

    // ✅ JwtService → JwtProvider로 교체 (0.12.x용)
    private final JwtProvider jwtProvider;

    // ✅ SessionStore가 없는 환경도 고려: 선택 주입
    private final ObjectProvider<SessionStore> sessionStoreProvider;

    private static final String BEARER = "Bearer ";

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (acc == null) return message;

        if (StompCommand.CONNECT.equals(acc.getCommand())) {
            String authHeader = acc.getFirstNativeHeader("Authorization");
            if (authHeader == null || !authHeader.startsWith(BEARER)) {
                // STOMP CONNECT 시 토큰이 없으면 거부
                throw new IllegalArgumentException("Missing or invalid Authorization header");
            }

            String token = authHeader.substring(BEARER.length());
            try {
                // ✅ 0.12.x: JwtProvider에서 Access 토큰 파싱(검증 포함)
                Claims claims = jwtProvider.parseAccessClaims(token);

                // 우리는 subject를 내부 PK(UUID 문자열)로 사용 중
                String userId = claims.getSubject();
                String sid = claims.get("sid", String.class); // 싱글 세션용(있으면 검사)

                SessionStore sessionStore = sessionStoreProvider.getIfAvailable();
                if (sessionStore != null && sid != null) {
                    boolean active = sessionStore.isActiveSid(userId, sid);
                    if (!active) throw new IllegalStateException("Inactive session");
                }

                // STOMP 연결에 Principal 심기
                Authentication authn =
                        new UsernamePasswordAuthenticationToken(userId, null, Collections.emptyList());
                acc.setUser(authn);
            } catch (Exception e) {
                log.warn("STOMP CONNECT token invalid: {}", e.getMessage());
                // CONNECT 거부
                throw new IllegalArgumentException("Invalid STOMP CONNECT token", e);
            }
        }

        return message;
    }
}
