package com.realtime.chatting.storage.controller;

import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.service.MessageService;
import com.realtime.chatting.config.UploadProps;
import com.realtime.chatting.storage.dto.StoredObject;
import com.realtime.chatting.storage.service.AttachmentService;
import com.realtime.chatting.storage.service.StorageService;
import lombok.RequiredArgsConstructor;
import org.apache.commons.io.FilenameUtils;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.UriUtils;

import java.io.InputStream;
import java.nio.file.*;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("${app.uploads.url-prefix:/api/files}")
@RequiredArgsConstructor
public class FileController {

    private final StorageService storage;
    private final UploadProps props;
    private final AttachmentService attachmentService;
    private final MessageService messageService;

    /* =============== 업로드 =============== */

    /**
     * 단일 파일 업로드
     * form: multipart/form-data; name="file"
     * query(optional): kind=image|file (없으면 contentType/확장자로 판별)
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<StoredObject> uploadOne(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "kind", required = false) String kind,
            @RequestParam(value = "messageId", required = false) String messageId
    ) throws Exception {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }

        // 사이즈 제한 체크
        boolean isImage = decideImage(kind, file.getContentType(), file.getOriginalFilename());
        long maxBytes = (long) (isImage ? props.getMaxImageMb() : props.getMaxFileMb()) * 1024L * 1024L;
        if (file.getSize() > maxBytes) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                    .header("X-Reason", isImage ? "image too large" : "file too large")
                    .build();
        }

        // 저장
        StoredObject so;
        try (InputStream in = file.getInputStream()) {
            so = storage.put(
                    in,
                    file.getSize(),
                    safeContentType(file.getContentType(), file.getOriginalFilename()),
                    safeOriginalName(file.getOriginalFilename())
            );
        }

        // messageId가 오면 첨부 row 생성
        if (messageId != null) {
            attachmentService.saveForMessage(messageId, so);
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(so);
    }

    /**
     * 다중 파일 업로드
     * form: multipart/form-data; name="files"
     */
    @PostMapping(path = "/batch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<StoredObject>> uploadBatch(
            @RequestPart("files") List<MultipartFile> files,
            @RequestParam(value = "kind", required = false) String kind,
            @RequestParam(value = "messageId", required = false) String messageId
    ) throws Exception {
        if (files == null || files.isEmpty()) {
            return ResponseEntity.badRequest().build();
        }
        List<StoredObject> results = new ArrayList<>(files.size());
        for (MultipartFile f : files) {
            if (f == null || f.isEmpty()) continue;

            boolean isImage = decideImage(kind, f.getContentType(), f.getOriginalFilename());
            long maxBytes = (long) (isImage ? props.getMaxImageMb() : props.getMaxFileMb()) * 1024L * 1024L;
            if (f.getSize() > maxBytes) {
                // 하나라도 초과하면 413과 함께 지금까지 성공한 것도 버릴지/부분성공으로 돌릴지 정책 선택
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                        .header("X-Reason", "one of files too large")
                        .build();
            }

            try (InputStream in = f.getInputStream()) {
                StoredObject so = storage.put(
                        in,
                        f.getSize(),
                        safeContentType(f.getContentType(), f.getOriginalFilename()),
                        safeOriginalName(f.getOriginalFilename())
                );
                results.add(so);
            }
        }
        // messageId가 있으면 모두 바인딩
        if (messageId != null && !results.isEmpty()) {
            attachmentService.saveForMessage(messageId, results);
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(results);
    }

    /* =============== 다운로드(스트리밍) =============== */

    /**
     * 저장 키 포맷이 yyyy/MM/dd/filename 이므로 명시 경로 변수 매핑
     * ex) GET /api/files/2025/10/08/abcd.jpg
     */
    @GetMapping("/{yyyy}/{MM}/{dd}/{filename:.+}")
    public ResponseEntity<Resource> getFile(
            @PathVariable String yyyy,
            @PathVariable String MM,
            @PathVariable String dd,
            @PathVariable String filename
    ) throws Exception {
        // baseDir + 상대경로 결합 및 traversal 방지
        Path base = Path.of(props.getBaseDir()).toAbsolutePath().normalize();
        Path target = base.resolve(Paths.get(yyyy, MM, dd, filename)).normalize();
        if (!target.startsWith(base)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (!Files.exists(target) || !Files.isRegularFile(target)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        String ctype = Files.probeContentType(target);
        if (!StringUtils.hasText(ctype)) {
            ctype = guessTypeFromExt(filename);
        }

        // 캐시 정책: 7일(원하면 조정)
        CacheControl cache = CacheControl.maxAge(Duration.ofDays(7)).cachePublic();

        // 이미지면 inline, 그 외는 다운로드 힌트(attachment)
        boolean inline = ctype != null && ctype.toLowerCase(Locale.ROOT).startsWith("image/");
        String disp = (inline ? "inline" : "attachment") +
                "; filename*=UTF-8''" + UriUtils.encode(filename, java.nio.charset.StandardCharsets.UTF_8);

        InputStreamResource body = new InputStreamResource(Files.newInputStream(target, StandardOpenOption.READ));

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(ctype))
                .contentLength(Files.size(target))
                .header(HttpHeaders.CONTENT_DISPOSITION, disp)
                .cacheControl(cache)
                .body(body);
    }

    /* =============== 유틸 =============== */

    private boolean decideImage(String kind, String contentType, String filename) {
        if (StringUtils.hasText(kind)) {
            return "image".equalsIgnoreCase(kind);
        }
        if (StringUtils.hasText(contentType)) {
            if (contentType.toLowerCase(Locale.ROOT).startsWith("image/")) return true;
        }
        String ext = FilenameUtils.getExtension(StringUtils.hasText(filename) ? filename : "").toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif" -> true;
            default -> false;
        };
    }

    private String safeContentType(String contentType, String filename) {
        if (StringUtils.hasText(contentType)) return contentType;
        return guessTypeFromExt(filename);
    }

    private String guessTypeFromExt(String filename) {
        String ext = FilenameUtils.getExtension(StringUtils.hasText(filename) ? filename : "").toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "bmp" -> "image/bmp";
            case "heic" -> "image/heic";
            case "heif" -> "image/heif";
            case "svg" -> "image/svg+xml";
            case "pdf" -> "application/pdf";
            case "txt" -> "text/plain; charset=utf-8";
            case "csv" -> "text/csv; charset=utf-8";
            case "md" -> "text/markdown; charset=utf-8";
            case "json" -> "application/json; charset=utf-8";
            default -> "application/octet-stream";
        };
    }

    private String safeOriginalName(String originalName) {
        if (!StringUtils.hasText(originalName)) return "upload.bin";
        // 브라우저/OS가 보낼 수 있는 전체 경로 제거
        String name = Paths.get(originalName).getFileName().toString();
        // 너무 긴 이름/비정상 문자는 옵션으로 정리 가능
        return name.length() > 255 ? name.substring(0, 255) : name;
    }
}