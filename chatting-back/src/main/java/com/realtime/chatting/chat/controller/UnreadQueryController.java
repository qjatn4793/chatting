package com.realtime.chatting.chat.controller;

import java.util.List;
import java.util.UUID;

import com.realtime.chatting.chat.dto.UnreadRoomDto;
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

    /**
     * 기본: 방(room) 기준 미읽음 [{ roomId, count }]
     * 옵션: /api/unread/summary?by=peer  → [{ peerId, count }]
     */
    @GetMapping("/summary")
    public Object summary(
            Authentication auth,
            @RequestParam(name = "by", required = false, defaultValue = "room") String by
    ) {
        final UUID meId = resolveMe(auth);

        if ("peer".equalsIgnoreCase(by)) {
            // 기존 호환: DM/친구 기준
            List<UnreadFriendDto> list = memberRepo.findDmUnreadOf(meId);
            return list;
        }

        // 기본: 방 기준
        var rows = memberRepo.findUnreadPerRoom(meId);
        return rows.stream()
                .map(p -> new UnreadRoomDto(p.getRoomId(), p.getCount() == null ? 0L : p.getCount()))
                .toList();
    }

    private UUID resolveMe(Authentication auth) {
        if (auth == null || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "unauthorized");
        }
        String principal = auth.getName();
        try {
            return UUID.fromString(principal);
        } catch (IllegalArgumentException e) {
            // sub가 이메일인 경우: 이메일 → UUID 조회
            return userRepository.findByEmail(principal)
                    .map(User::getId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid principal"));
        }
    }
}