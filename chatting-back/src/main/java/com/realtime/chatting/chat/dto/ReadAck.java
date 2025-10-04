package com.realtime.chatting.chat.dto;

import java.util.UUID;

public record ReadAck(
        String roomId,
        UUID meId,
        String peerId,   // DM이 아니면 null
        int unread,      // 항상 0으로 내려가도록
        boolean ok       // reset이 실제로 반영됐는지
) {}