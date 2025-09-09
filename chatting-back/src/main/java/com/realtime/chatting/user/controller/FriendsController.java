package com.realtime.chatting.user.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.realtime.chatting.chat.dto.FriendDto;
import com.realtime.chatting.login.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendsController {

    private final UserRepository userRepository;

    @GetMapping
    public List<FriendDto> list(Authentication auth) {
        String me = (String) auth.getPrincipal();
        return userRepository.findAll().stream()
            .filter(u -> !u.getUsername().equals(me))
            .map(u -> new FriendDto(u.getUsername(), u.getUsername(), false))
            .collect(java.util.stream.Collectors.toList());
    }
}
