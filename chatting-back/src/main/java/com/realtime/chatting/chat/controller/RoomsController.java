package com.realtime.chatting.chat.controller;

import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import com.realtime.chatting.chat.dto.RoomDto;
import com.realtime.chatting.chat.dto.MessageDto;
import com.realtime.chatting.chat.dto.SendMessageRequest;
import com.realtime.chatting.chat.service.RoomService;
import com.realtime.chatting.chat.service.MessageService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomsController {

    private final RoomService roomService;
    private final MessageService messageService;
    private final org.springframework.amqp.rabbit.core.RabbitTemplate rabbitTemplate;

    @GetMapping
    public List<RoomDto> myRooms(Authentication auth) {
        return roomService.myRooms((String) auth.getPrincipal());
    }

    @PostMapping("/dm/{friendUsername}")
    public RoomDto openDm(@PathVariable String friendUsername, Authentication auth) {
        String me = (String) auth.getPrincipal();
        return roomService.openDm(me, friendUsername);
    }

    @GetMapping("/{roomId}/messages")
    public List<MessageDto> history(@PathVariable String roomId, @RequestParam(defaultValue = "50") int limit) {
        return messageService.history(roomId, Math.min(200, Math.max(1, limit)));
    }

    @PostMapping("/{roomId}/send")
    public void send(@PathVariable String roomId, @RequestBody SendMessageRequest req, Authentication auth) {
        String sender = (String) auth.getPrincipal();
        MessageDto saved = messageService.save(roomId, sender, req.getMessage());
        rabbitTemplate.convertAndSend("chatExchange", "chat.message", saved);
    }
}
