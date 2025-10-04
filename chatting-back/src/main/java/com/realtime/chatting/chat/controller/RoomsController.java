package com.realtime.chatting.chat.controller;

import java.util.List;
import java.util.UUID;

import com.realtime.chatting.chat.dto.OpenDmByIdentifierRequest;
import com.realtime.chatting.chat.service.MessageService;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import com.realtime.chatting.chat.dto.RoomDto;
import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.dto.SendMessageRequest;
import com.realtime.chatting.chat.service.RoomService;
import com.realtime.chatting.config.RabbitConfig;
import com.realtime.chatting.friend.service.FriendService;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomsController {

    private final RoomService roomService;
    private final MessageService messageService;
    private final RabbitTemplate rabbitTemplate;
    private final FriendService friendService;
    private final UserRepository userRepository;

    /** 내 방 목록 (주체: JWT sub = UUID) */
    @GetMapping
    public List<RoomDto> myRooms(Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());     // ✅ sub=UUID
        return roomService.myRooms(String.valueOf(myId));
    }

    /** DM 개설 */
    @PostMapping("/dm/by-identifier")
    public RoomDto openDmByIdentifier(@Valid @RequestBody OpenDmByIdentifierRequest req,
                                      Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        var other = friendService.findUserByFlexibleIdentifier(req.getIdentifier())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "user not found"));

        if (other.getId().equals(myId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cannot dm yourself");
        }

        if (!friendService.areFriendsByUserId(myId, other.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "not friends");
        }

        return roomService.openDmById(myId, other.getId());
    }

    /** 히스토리 조회: 인증 불필수라면 그대로, 필수면 Security에서 보장 */
    @GetMapping("/{roomId}/messages")
    public List<MessageDto> history(@PathVariable("roomId") String roomId,
                                    @RequestParam(name = "limit", defaultValue = "50") int limit) {
        int capped = Math.min(200, Math.max(1, limit));
        return messageService.history(roomId, capped);
    }

    /** 메시지 전송: sender는 내 email로 기록(표시/알림키와 일치) */
    @PostMapping("/{roomId}/send")
    public MessageDto send(@PathVariable("roomId") String roomId,
                           @Valid @RequestBody SendMessageRequest req,
                           Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        User me = userRepository.findById(myId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "me not found"));

        // sender = 식별자(권장: UUID 문자열 또는 이메일)
        // username = 화면 표기용 이름(닉네임)
        String sender = me.getEmail();          // 또는 me.getEmail() 사용
        String username = me.getUsername();              // NOT NULL 가정 (아래 서비스에서 가드도 넣음)
        String messageId = UUID.randomUUID().toString();

        MessageDto saved = messageService.save(
                roomId,
                messageId,
                username,
                sender,
                req.getMessage()                        // DTO가 message라면 OK (백엔드/프론트 키 통일 권장)
        );

        // RabbitMQ publish
        String routingKey = "chat.message.room." + roomId;
        rabbitTemplate.convertAndSend(RabbitConfig.CHAT_EXCHANGE, routingKey, saved);

        return saved;
    }
}
