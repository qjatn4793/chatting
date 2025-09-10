package com.realtime.chatting.friend.controller;

import com.realtime.chatting.friend.service.FriendRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/friend-requests")
@RequiredArgsConstructor
public class FriendRequestController {

    private final FriendRequestService service;

    @PostMapping("/{id}/accept")
    public ResponseEntity<Void> accept(@PathVariable("id") Long id, Authentication auth) {
        String me = auth.getName();
        service.accept(id, me);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/decline")
    public ResponseEntity<Void> decline(@PathVariable("id") Long id, Authentication auth) {
        String me = auth.getName();
        service.decline(id, me);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancel(@PathVariable("id") Long id, Authentication auth) {
        String me = auth.getName();
        service.cancel(id, me); // cancel 전용 메서드 사용
        return ResponseEntity.noContent().build();
    }
}
