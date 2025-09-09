package com.realtime.chatting.chat.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.chat.entity.ChatRoom;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {
    List<ChatRoomMember> findByUser(User user);
    Optional<ChatRoomMember> findByRoomAndUser(ChatRoom room, User user);
    List<ChatRoomMember> findByRoom(ChatRoom room);
}
