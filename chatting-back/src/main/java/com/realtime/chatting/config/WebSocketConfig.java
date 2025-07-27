package com.realtime.chatting.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");  // 클라이언트에게 전달할 메시지의 prefix: /topic
        registry.setApplicationDestinationPrefixes("/app");  // 클라이언트가 서버로 보낼 메시지의 prefix: /app
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/chat")
        .setAllowedOrigins("http://222.99.202.20:3000") // React 클라이언트 URL 추가
        .setAllowedOrigins("http://localhost:3000") // React 클라이언트 URL 추가
        .withSockJS();;  // 클라이언트에서 /chat으로 WebSocket 연결
    }
}