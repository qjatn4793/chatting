package com.realtime.chatting.notify;

import lombok.*;

import java.time.Instant;
import java.util.Map;

@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@Builder
public class NotifyEvent {
    // FRIEND_REQUEST_RECEIVED / FRIEND_REQUEST_ACCEPTED / FRIEND_REQUEST_DECLINED / FRIEND_REMOVED ...
    private String type;
    private String from;
    private String to;
    private Instant at;
    private Map<String, Object> payload;
}
