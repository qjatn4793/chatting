package com.realtime.chatting.config;

import lombok.RequiredArgsConstructor;

import java.util.Collections;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import com.realtime.chatting.auth.SessionStore;
import com.realtime.chatting.login.service.JwtService;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;

@Component
@RequiredArgsConstructor
public class JwtStompInterceptor implements ChannelInterceptor {
  private final JwtService jwtService; // 토큰→Authentication 생성 책임
  
  private final SessionStore sessionStore = null;

  @Override
  public Message<?> preSend(Message<?> message, MessageChannel channel) {
    StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
    if (acc != null && StompCommand.CONNECT.equals(acc.getCommand())) {
      String auth = acc.getFirstNativeHeader("Authorization");
      if (auth != null && auth.startsWith("Bearer ")) {
        String raw = auth.substring(7);
        try {
          // 토큰 파싱
          Jws<Claims> jws = jwtService.parse(raw);
          Claims claims = jws.getBody();
          String username = claims.getSubject();
          String sid = claims.get("sid", String.class);

          // 세션 저장소와 SID 일치 확인
          if (sessionStore != null) {
            boolean active = sessionStore.isActiveSid(username, sid);
            if (!active) {
              throw new IllegalStateException("Inactive session");
            }
          }

          // 3) Principal 심기
          Authentication authn =
              new UsernamePasswordAuthenticationToken(username, null, Collections.emptyList());
          acc.setUser(authn);

        } catch (Exception e) {
          // 파싱 실패/만료/세션 불일치 등은 CONNECT 거부
          throw new IllegalArgumentException("Invalid STOMP CONNECT token", e);
        }
      }
    }
    return message;
  }
}