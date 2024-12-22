package com.realtime.chatting.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")                       // 모든 경로에 대해 CORS를 허용
                .allowedOrigins("http://localhost:3000") // 클라이언트의 URL
                .allowedMethods("GET", "POST", "PUT", "DELETE") // 허용할 HTTP 메소드들
                .allowedHeaders("*")                    // 허용할 헤더들
                .allowCredentials(true);                // 자격 증명 허용 (쿠키, 인증 헤더 등)
    }
}