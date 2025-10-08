package com.realtime.chatting.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Files;
import java.nio.file.Path;

@RequiredArgsConstructor
@Configuration
public class UploadInitConfig {
    private final UploadProps props;

    @Bean
    ApplicationRunner mkUploadDir() {
        return args -> {
            Path p = Path.of(props.getBaseDir());
            Files.createDirectories(p);
            // 권한/쓰기 가능 여부 체크 정도만 로그로…
            if (!Files.isWritable(p)) {
                System.err.println("[WARN] upload dir not writable: " + p);
            } else {
                System.out.println("[OK] upload dir ready: " + p);
            }
        };
    }
}