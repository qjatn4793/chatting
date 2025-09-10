package com.realtime.chatting.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class SecurityBeansConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        // 강도(라운드) 기본값 10, 필요시 new BCryptPasswordEncoder(12) 등으로 조정 가능
        return new BCryptPasswordEncoder();
    }
}
