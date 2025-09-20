package com.realtime.chatting.chat.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.realtime.chatting.chat.dto.UnreadFriendDto;
import com.realtime.chatting.chat.repository.ChatRoomMemberRepository;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/unread")
public class UnreadQueryController {
  private final ChatRoomMemberRepository memberRepo;

  @GetMapping("/summary")
  public List<UnreadFriendDto> summary(org.springframework.security.core.Authentication auth) {
    return memberRepo.findDmUnreadOf(auth.getName());
  }
}