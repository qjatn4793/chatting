package com.realtime.chatting.chat.controller;

import java.util.List;
import java.util.UUID;

import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.login.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import com.realtime.chatting.chat.dto.UnreadFriendDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/unread")
public class UnreadQueryController {
    private final ChatRoomMemberRepository memberRepo;
    private final UserRepository userRepository;

    @GetMapping("/summary")
    public List<UnreadFriendDto> summary(Authentication auth) {
        String principal = auth.getName();
        UUID meId;
        try {
            meId = UUID.fromString(principal);
        } catch (IllegalArgumentException e) {
            // sub가 이메일인 경우: 이메일 → UUID 조회
            meId = userRepository.findByEmail(principal)
                    .map(User::getId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid principal"));
        }
        return memberRepo.findDmUnreadOf(meId);
    }
}
