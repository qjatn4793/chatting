package com.realtime.chatting.friend.controller;

import com.realtime.chatting.friend.dto.FriendRequestDto;
import com.realtime.chatting.friend.service.FriendService;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendController {

    private final FriendService friendService;
    private final UserRepository userRepository;

    /** 내 친구 목록(이메일/UUID 어떤 포맷을 쓸지는 팀 규칙에 맞춰) */
    @GetMapping
    public List<String> myFriends(Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        // 이메일 목록으로 돌려주고 싶으면 FriendService.myFriendsByUserId 사용
        return friendService.myFriendsByUserId(myId);
    }

    /** ✅ 친구 요청: identifier(이메일/휴대폰/이름) 중 하나만 보내면 됨 */
    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public FriendRequestDto sendFlexible(@RequestBody SendFriendRequest body, Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return friendService.sendRequestFlexible(myId, body.identifier());
    }

    // 기존 UUID 버전/이메일 버전 엔드포인트를 남겨두고 싶으면 그대로 유지해도 OK

    /* ======= 나머지 기존 요청/수락/거절/취소 ======= */

    @GetMapping("/requests/incoming")
    public List<FriendRequestDto> incoming(Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return friendService.incomingPendingByUserId(myId);
    }

    @GetMapping("/requests/outgoing")
    public List<FriendRequestDto> outgoing(Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return friendService.outgoingPendingByUserId(myId);
    }

    @PostMapping("/requests/{id}/accept")
    public FriendRequestDto accept(@PathVariable("id") Long id, Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return friendService.acceptByUserId(id, myId);
    }

    @PostMapping("/requests/{id}/decline")
    public FriendRequestDto decline(@PathVariable("id") Long id, Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        return friendService.declineByUserId(id, myId);
    }

    @DeleteMapping("/requests/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable("id") Long id, Authentication auth) {
        UUID myId = UUID.fromString(auth.getName());
        friendService.cancelByUserId(id, myId);
    }

    /** 요청 바디용 DTO (record로 간단히) */
    public record SendFriendRequest(String identifier) {}
}
