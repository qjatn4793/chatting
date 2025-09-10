package com.realtime.chatting.friend.controller;

import com.realtime.chatting.friend.dto.FriendRequestDto;
import com.realtime.chatting.friend.service.FriendService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendController {

    private final FriendService friendService;

    @GetMapping
    public List<String> myFriends(Authentication auth) {
        String me = auth.getName();
        return friendService.myFriends(me);
    }

    @PostMapping("/requests/{targetUsername}")
    public FriendRequestDto send(@PathVariable("targetUsername") String targetUsername, Authentication auth) {
        String me = auth.getName();
        return friendService.sendRequest(me, targetUsername);
    }

    @GetMapping("/requests/incoming")
    public List<FriendRequestDto> incoming(Authentication auth) {
        return friendService.incomingPending(auth.getName());
    }

    @GetMapping("/requests/outgoing")
    public List<FriendRequestDto> outgoing(Authentication auth) {
        return friendService.outgoingPending(auth.getName());
    }

    @PostMapping("/requests/{id}/accept")
    public FriendRequestDto accept(@PathVariable("id") Long id, Authentication auth) {
        return friendService.accept(id, auth.getName());
    }

    @PostMapping("/requests/{id}/decline")
    public FriendRequestDto decline(@PathVariable("id") Long id, Authentication auth) {
        return friendService.decline(id, auth.getName());
    }

    @DeleteMapping("/requests/{id}")
    public void cancel(@PathVariable("id") Long id, Authentication auth) {
        friendService.decline(id, auth.getName());
    }
}
