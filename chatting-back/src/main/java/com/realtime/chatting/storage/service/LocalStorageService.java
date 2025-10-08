package com.realtime.chatting.storage.service;

import com.realtime.chatting.storage.dto.StoredObject;
import jakarta.annotation.PostConstruct;
import org.apache.commons.io.FilenameUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.util.UUID;

@Service
public class LocalStorageService implements StorageService {

    /** 비어있으면 홈 디렉터리 아래 기본값으로 */
    @Value("${app.uploads.base-dir:${user.home}/chat-uploads}")
    private String baseDir;

    /** 기본 URL prefix */
    @Value("${app.uploads.url-prefix:/api/files}")
    private String urlPrefix;

    @PostConstruct
    void init() throws Exception {
        // prefix 정규화: 끝 슬래시 제거
        if (!StringUtils.hasText(urlPrefix)) urlPrefix = "/api/files";
        urlPrefix = urlPrefix.trim().replaceAll("/+$", "");

        // 업로드 디렉터리 보장
        if (!StringUtils.hasText(baseDir)) {
            baseDir = System.getProperty("user.home") + "/chat-uploads";
        }
        baseDir = baseDir.trim();
        Files.createDirectories(Path.of(baseDir));
    }

    @Override
    public StoredObject put(InputStream in, long size, String contentType, String originalName) throws Exception {
        LocalDate now = LocalDate.now();
        String ext = safeExt(originalName);
        String file = UUID.randomUUID().toString().replace("-", "");
        String storageKey = String.format(
                "%04d/%02d/%02d/%s%s",
                now.getYear(), now.getMonthValue(), now.getDayOfMonth(),
                file, ext.isEmpty() ? "" : "." + ext
        );

        Path dest = Path.of(baseDir, storageKey);
        Files.createDirectories(dest.getParent());

        // CREATE_NEW로 충돌 방지
        try (OutputStream os = Files.newOutputStream(dest, StandardOpenOption.CREATE_NEW)) {
            in.transferTo(os);
        }

        // contentType 보정(없으면 탐지 시도)
        if (!StringUtils.hasText(contentType)) {
            String probed = Files.probeContentType(dest);
            if (StringUtils.hasText(probed)) contentType = probed;
            else contentType = "application/octet-stream";
        }

        String url = urlPrefix + "/" + storageKey; // ex) /api/files/2025/10/08/xxx.jpg

        return StoredObject.builder()
                .storageKey(storageKey)
                .url(url)
                .size(size)
                .contentType(contentType)
                .originalName(originalName)
                .build();
    }

    @Override
    public String urlFor(String storageKey) {
        if (!StringUtils.hasText(storageKey)) return urlPrefix + "/";
        return urlPrefix + "/" + storageKey;
    }

    /** 에지 케이스 방지: 확장자만 소문자로 안전 추출 */
    private String safeExt(String originalName) {
        if (!StringUtils.hasText(originalName)) return "";
        String ext = FilenameUtils.getExtension(originalName);
        if (ext == null) return "";
        ext = ext.trim().toLowerCase();
        // 너무 긴/이상한 확장자 방지(선택)
        if (ext.length() > 10) return "";
        return ext.replaceAll("[^a-z0-9]+", "");
    }
}
