package com.realtime.chatting.config;

import java.util.Arrays;
import java.util.Collections;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
	
	private final JWTAuthenticationFilter jwtAuthenticationFilter;

    // 생성자 주입을 통해 JWTAuthenticationFilter 주입
    public SecurityConfig(JWTAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }
	
    @Override
    protected void configure(HttpSecurity http) throws Exception {
    	// JWT 필터를 등록
        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    	
        http.csrf().disable()
            .authorizeRequests()
                .antMatchers("/api/auth/**").permitAll()  // 로그인과 회원가입은 인증 없이 허용
                .antMatchers("/chat/**").permitAll()
                .anyRequest().authenticated()  // 나머지 요청은 인증 필요
            .and()
            .cors().configurationSource(corsConfigurationSource())  // CORS 설정 활성화
            .and()
            .formLogin().disable()  // 기본 로그인 폼 비활성화
            .httpBasic().disable();
    }

    // CORS Configuration을 정의하는 Bean
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList("http://localhost:3000"));  // 허용할 origin
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));  // 허용할 HTTP 메소드
        configuration.setAllowedHeaders(Collections.singletonList("*"));  // 모든 헤더 허용
        configuration.setAllowCredentials(true);  // 자격 증명(쿠키, 인증 헤더 등) 허용

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);  // 모든 경로에 대해 CORS 설정

        return source;
    }
    
    @Bean
    public BCryptPasswordEncoder encodePassword() {
        return new BCryptPasswordEncoder();
    }
}
