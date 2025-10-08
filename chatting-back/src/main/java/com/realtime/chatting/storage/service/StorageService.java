package com.realtime.chatting.storage.service;

import com.realtime.chatting.storage.dto.StoredObject;

import java.io.InputStream;

public interface StorageService {
    StoredObject put(InputStream in, long size, String contentType, String originalName) throws Exception;
    String urlFor(String storageKey);
}