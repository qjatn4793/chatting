package com.realtime.chatting.chat.controller;

import java.util.List;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
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
    private final RabbitTemplate rabbitTemplate;

    @GetMapping
    public List<RoomDto> myRooms(Authentication auth) {
        return roomService.myRooms(auth.getName());
    }

    @PostMapping("/dm/{friendUsername}")
    public RoomDto openDm(@PathVariable("friendUsername") String friendUsername,
                          Authentication auth) {
        String me = auth.getName();
        return roomService.openDm(me, friendUsername);
    }

    @GetMapping("/{roomId}/messages")
    public List<MessageDto> history(@PathVariable("roomId") String roomId,
                                    @RequestParam(name = "limit", defaultValue = "50") int limit) {
        int capped = Math.min(200, Math.max(1, limit));
        return messageService.history(roomId, capped);
    }

    @PostMapping("/{roomId}/send")
    public MessageDto send(@PathVariable("roomId") String roomId,
                           @RequestBody SendMessageRequest req,
                           Authentication auth) {
        String sender = auth.getName();
        MessageDto saved = messageService.save(roomId, sender, req.getMessage());
        rabbitTemplate.convertAndSend("chatExchange", "chat.message", saved);
        return saved; // 클라이언트가 즉시 에코 받도록 반환
    }
}
