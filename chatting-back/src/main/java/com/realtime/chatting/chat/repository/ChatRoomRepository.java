package com.realtime.chatting.chat.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.realtime.chatting.chat.entity.ChatRoom;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, String> {
    Optional<ChatRoom> findById(String id);
    List<ChatRoom> findByType(ChatRoom.Type type);
}
