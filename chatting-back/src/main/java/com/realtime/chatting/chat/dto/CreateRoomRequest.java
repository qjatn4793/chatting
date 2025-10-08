package com.realtime.chatting.chat.dto;

import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateRoomRequest(
        String type,                       // "GROUP"만 허용
        @Size(min = 1, max = 200) String title, // 필수: 최소 1자
        List<String> identifiers           // 선택: 초대 식별자(uuid)
) {}
