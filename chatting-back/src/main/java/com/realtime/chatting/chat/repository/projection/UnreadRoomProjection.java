package com.realtime.chatting.chat.repository.projection;

import java.util.UUID;

public interface UnreadRoomProjection {
    UUID getRoomId();
    Long getCount();
}