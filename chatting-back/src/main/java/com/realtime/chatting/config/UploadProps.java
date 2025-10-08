package com.realtime.chatting.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.uploads")
@Data
public class UploadProps {
    private String baseDir;       // /data/uploads (docker), D:/files (local)
    private String urlPrefix;     // /api/files
    private int maxImageMb = 15;
    private int maxFileMb = 100;
}