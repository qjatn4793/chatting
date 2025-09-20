package com.realtime.chatting.chat.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.login.entity.User;
import com.realtime.chatting.chat.dto.UnreadFriendDto;
import com.realtime.chatting.chat.entity.ChatRoom;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {
    List<ChatRoomMember> findByUser(User user);
    Optional<ChatRoomMember> findByRoomAndUser(ChatRoom room, User user);
    List<ChatRoomMember> findByRoom(ChatRoom room);
    
    @Query("""
            select m.user.username
            from ChatRoomMember m
            where m.room.id = :roomId
            """)
     List<String> findParticipantUsernames(@Param("roomId") String roomId);
    
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
           update ChatRoomMember m
           set m.unreadCount = m.unreadCount + 1
           where m.room.id = :roomId
             and m.user.username <> :sender
           """)
    int bumpUnread(@Param("roomId") String roomId, @Param("sender") String sender);

    @Modifying(clearAutomatically = true)
    @Query("""
           update ChatRoomMember m
           set m.unreadCount = 0
           where m.room.id = :roomId
             and m.user.username = :username
           """)
    int resetUnread(@Param("roomId") String roomId, @Param("username") String username);

    // 로그인 직후, DM 방에서 내 미읽음 요약 (DM은 참여자 2명 가정)
    @Query("""
       select new com.realtime.chatting.chat.dto.UnreadFriendDto(om.user.username, m.unreadCount)
       from ChatRoomMember m
         join m.room r
         join ChatRoomMember om on om.room = r and om.user <> m.user
       where r.type = com.realtime.chatting.chat.entity.ChatRoom.Type.DM
         and m.user.username = :me
         and m.unreadCount > 0
       """)
    List<UnreadFriendDto> findDmUnreadOf(@Param("me") String me);

    // 필요시: 방별로 내 unread 쿼리
    @Query("""
       select m.unreadCount
       from ChatRoomMember m
       where m.room.id = :roomId and m.user.username = :me
       """)
    Integer findMyUnread(@Param("roomId") String roomId, @Param("me") String me);
    
    // DM 방에서 "나(me)"의 상대(동일 방의 다른 멤버) 아이디 반환
    @Query("""
           select om.user.username
           from ChatRoomMember m
             join ChatRoomMember om on om.room = m.room and om.user <> m.user
           where m.room.id = :roomId
             and m.user.username = :me
           """)
    String findDmPeerUsername(@Param("roomId") String roomId, @Param("me") String me);
}
