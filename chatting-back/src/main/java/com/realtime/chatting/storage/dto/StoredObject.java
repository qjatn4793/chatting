package com.realtime.chatting.storage.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class StoredObject {
    private final String storageKey;
    private final String url;          // public url (ex. /api/files/2025/10/08/xxx.jpg)
    private final long size;
    private final String contentType;
    private final String originalName;
}