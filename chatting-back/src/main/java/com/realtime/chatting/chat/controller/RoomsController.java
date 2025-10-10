package com.realtime.chatting.chat.controller;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import com.realtime.chatting.ai.repository.RoomAiMemberRepository;
import com.realtime.chatting.ai.service.AiChatService;
import com.realtime.chatting.chat.dto.*;
import com.realtime.chatting.chat.service.ChatFanoutService;
import com.realtime.chatting.chat.service.MessageService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import com.realtime.chatting.chat.service.RoomService;
import com.realtime.chatting.friend.service.FriendService;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

import static com.realtime.chatting.ai.util.MentionUtil.hasAiMention;
import static com.realtime.chatting.ai.util.MentionUtil.stripOneAiMention;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomsController {

    private final RoomService roomService;
    private final MessageService messageService;
    private final FriendService friendService;
    private final UserRepository userRepository;

    private final AiChatService aiChatService;
    private final RoomAiMemberRepository roomAiMemberRepository;

    // 브로커 퍼블리시를 비동기로 처리하는 서비스
    private final ChatFanoutService chatFanoutService;

    /** 내 방 목록 (주체: JWT sub = UUID) */
    @GetMapping
    public List<RoomDto> myRooms(Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());     // sub=UUID
        return roomService.myRooms(String.valueOf(myId));
    }

    /** 방 단건 조회: 멤버만 열람 허용 (InviteModal에서 사용) */
    @GetMapping("/{roomId}")
    public RoomDto getRoom(@PathVariable("roomId") String roomId, Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return roomService.getRoomForMember(myId, roomId);
    }

    /** 그룹 방 생성: 메시지 없이 먼저 방을 만든 뒤 필요 시 멤버 초대 */
    @PostMapping
    public RoomDto createRoom(@Valid @RequestBody CreateRoomRequest req,
                              Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        String type = (req.type() == null ? "GROUP" : req.type().trim().toUpperCase());
        if (!"GROUP".equals(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "only GROUP creation is supported");
        }
        String title = req.title() == null ? "" : req.title().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title is required");
        }

        List<UUID> inviteeIds = (req.identifiers() == null ? List.<String>of() : req.identifiers())
                .stream()
                .map(idf -> friendService.findUserByFlexibleIdentifier(idf).map(User::getId).orElse(null))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .limit(200)
                .toList();

        return roomService.createGroupRoom(myId, title, inviteeIds);
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
                                    @RequestParam(name = "limit", defaultValue = "50") int limit,
                                    @RequestParam(name = "before", required = false) Long beforeMillis) {
        int capped = Math.min(200, Math.max(1, limit));
        Instant before = (beforeMillis != null ? Instant.ofEpochMilli(beforeMillis) : null);
        return messageService.history(roomId, capped, before);
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

        MessageDto saved = messageService.createUserMessage(
                roomId,
                messageId,
                username,
                sender,
                req.getMessage()
        );

        // @ai 멘션이 있으면 AI 라우팅
        if (hasAiMention(req.getMessage())) {
            // 룸에 AI가 없으면 스킵
            boolean hasAiInRoom = !roomAiMemberRepository.findByIdRoomId(roomId).isEmpty();
            if (hasAiInRoom) {
                String cleaned = stripOneAiMention(req.getMessage());
                // onHumanMessage는 @Async로 선언해두면 요청을 막지 않습니다.
                aiChatService.onHumanMessage(roomId, cleaned);
            }
        }

        // 브로커 퍼블리시는 비동기로(채팅 UX를 블로킹하지 않음)
        chatFanoutService.publishToBrokerAsync(roomId, saved);

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

    /** 멤버 초대*/
    @PostMapping("/{roomId}/invite")
    public InviteResponse invite(@PathVariable("roomId") String roomId,
                                 @RequestBody InviteRequest req,
                                 Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        List<String> ids = (req != null && req.identifiers() != null) ? req.identifiers() : List.of();
        return roomService.inviteMembers(myId, roomId, ids);
    }
}