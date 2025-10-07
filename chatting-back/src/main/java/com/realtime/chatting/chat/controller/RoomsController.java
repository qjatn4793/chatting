package com.realtime.chatting.chat.controller;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

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
        UUID myId = UUID.fromString(auth.getName());     // sub=UUID
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

    /** 메시지 전송: sender는 내 UUID 문자열로 기록(미읽음/알림 키와 일치) */
    @PostMapping("/{roomId}/send")
    public MessageDto send(@PathVariable("roomId") String roomId,
                           @Valid @RequestBody SendMessageRequest req,
                           Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        User me = userRepository.findById(myId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "me not found"));

        // sender = UUID 문자열 (미읽음 집계/알림 라우팅과 일치)
        String sender = me.getId().toString();
        // username = 화면 표기용 이름(닉네임)
        String username = me.getUsername();
        String messageId = UUID.randomUUID().toString();

        MessageDto saved = messageService.save(
                roomId,
                messageId,
                username,
                sender,
                req.getMessage()
        );

        // RabbitMQ publish
        String routingKey = "chat.message.room." + roomId;
        rabbitTemplate.convertAndSend(RabbitConfig.CHAT_EXCHANGE, routingKey, saved);

        return saved;
    }

    /**
     * 벌크 최신 메시지 API
     * GET /api/rooms/last-messages?roomIds=a,b,c
     * - 인증 사용자가 구성원인 방만 응답
     * - 각 방당 최신 1건(MessageDto)
     */
    @GetMapping("/last-messages")
    public List<MessageDto> lastMessages(@RequestParam("roomIds") String roomIdsCsv,
                                         Authentication auth) {
        if (roomIdsCsv == null || roomIdsCsv.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "roomIds is required");
        }

        // roomIds 파싱 + 중복 제거 + 최대 개수 제한(예: 500)
        List<String> roomIds = Arrays.stream(roomIdsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(500)
                .collect(Collectors.toList());

        UUID myId;
        try {
            myId = UUID.fromString(auth.getName());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid principal");
        }

        return messageService.lastMessagesBulk(myId, roomIds);
    }
}