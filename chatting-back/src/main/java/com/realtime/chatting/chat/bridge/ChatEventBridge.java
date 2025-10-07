package com.realtime.chatting.chat.bridge;

import com.realtime.chatting.chat.dto.ChatNotify;
import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;
import com.realtime.chatting.config.RabbitConfig;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChatEventBridge {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatRoomMemberRepository memberRepo;
    private final UserRepository userRepo;

    @Transactional
    @RabbitListener(queues = RabbitConfig.WS_BRIDGE_QUEUE)
    public void onMessage(
            MessageDto message,
            @Header(name = AmqpHeaders.RECEIVED_ROUTING_KEY, required = false) String routingKey
    ) {
        String roomId = resolveRoomId(message, routingKey);
        if (roomId == null) return;

        // 1) 방 브로드캐스트 (Room 타임라인에 원문 메시지 전파)
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId, message);

        // 2) 미읽음 +1 : sender는 UUID 문자열이어야 함
        UUID senderUuid = null;
        String senderRaw = message.getSender(); // UUID 문자열 기대
        if (senderRaw != null && !senderRaw.isBlank()) {
            try {
                senderUuid = UUID.fromString(senderRaw);
                memberRepo.bumpUnread(roomId, senderUuid);
            } catch (IllegalArgumentException ex) {
                log.warn("ChatEventBridge: sender is not a UUID: {}", senderRaw);
            }
        }

        // 2-1) 표시용 username 결정
        // 우선순위: message.username -> (senderUuid로 유저 조회하여 display/email) -> senderRaw
        String displayUsername = message.getUsername();
        if (displayUsername == null || displayUsername.isBlank()) {
            try {
                if (senderUuid != null) {
                    // 예: User 엔티티에 getUsername()/getEmail() 등이 있다고 가정
                    var userOpt = userRepo.findById(senderUuid);
                    if (userOpt.isPresent()) {
                        var u = userOpt.get();
                        displayUsername = (u.getUsername() != null && !u.getUsername().isBlank())
                                ? u.getUsername()
                                : u.getEmail(); // 이메일 폴백
                    }
                }
            } catch (Exception ignore) {}
        }
        if (displayUsername == null || displayUsername.isBlank()) {
            displayUsername = senderRaw; // 최종 폴백
        }

        // 3) 사용자별 알림 (구독 키 = UUID 문자열)
        var participantIds = memberRepo.findParticipantIds(roomId);

        String preview = abbreviate(message.getContent(), 80);
        long now = System.currentTimeMillis();

        for (UUID uid : participantIds) {
            if (uid == null) continue;
            // 본인에게는 알림 X
            if (senderUuid != null && uid.equals(senderUuid)) continue;

            ChatNotify notif = ChatNotify.builder()
                    .type("MESSAGE")
                    .roomId(roomId)
                    .senderUserId(senderUuid != null ? senderUuid.toString() : senderRaw)
                    .sender(senderRaw)                 // 백워드 호환
                    .username(displayUsername)         // 표시용 username 포함
                    .content(message.getContent())     // 필요 시 null로 두고 preview만 사용해도 됨
                    .preview(preview)
                    .createdAt(now)
                    .build();

            messagingTemplate.convertAndSend("/topic/chat-notify/" + uid, notif);
        }
    }

    private String resolveRoomId(MessageDto m, String rk) {
        String roomId = m.getRoomId();
        if ((roomId == null || roomId.isBlank()) && rk != null && rk.startsWith("chat.message.room.")) {
            roomId = rk.substring("chat.message.room.".length());
        }
        if (roomId == null || roomId.isBlank()) {
            log.warn("WS bridge dropped: roomId missing. rk={}, payload={}", rk, m);
            return null;
        }
        return roomId;
    }

    private static String abbreviate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, Math.max(0, max - 1)) + "…";
    }
}