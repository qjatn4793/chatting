package com.realtime.chatting.chat.dto;

import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttachmentDto {
    private Long id;
    private String storageKey;
    private String url;
    private Long size;
    private String contentType;
    private String originalName;
    private Integer width;
    private Integer height;
    private Instant createdAt;
}