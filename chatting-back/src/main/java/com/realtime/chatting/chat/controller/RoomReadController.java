package com.realtime.chatting.chat.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.realtime.chatting.chat.dto.ReadAck;
import com.realtime.chatting.chat.service.RoomReadService;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/rooms")
public class RoomReadController {
	private final RoomReadService roomReadService;

  @PostMapping("/{roomId}/read")
  public ReadAck markRead(@PathVariable("roomId") String roomId, Authentication auth) {
    return roomReadService.markRead(roomId, auth.getName());
  }
}