package com.realtime.chatting.chat.repository;

import com.realtime.chatting.chat.dto.UnreadFriendDto;
import com.realtime.chatting.chat.entity.ChatRoom;
import com.realtime.chatting.chat.entity.ChatRoomMember;
import com.realtime.chatting.login.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatRoomMemberRepository extends JpaRepository<ChatRoomMember, Long> {

    List<ChatRoomMember> findByUser(User user);

    Optional<ChatRoomMember> findByRoomAndUser(ChatRoom room, User user);

    List<ChatRoomMember> findByRoom(ChatRoom room);

    /** 방 참여자들의 UUID 목록 */
    @Query("""
           select m.user.id
           from ChatRoomMember m
           where m.room.id = :roomId
           """)
    List<UUID> findParticipantIds(@Param("roomId") String roomId);

    /** 미읽음 +1 (보낸 본인 제외) */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
           update ChatRoomMember m
           set m.unreadCount = m.unreadCount + 1
           where m.room.id = :roomId
             and m.user.id <> :senderId
           """)
    int bumpUnread(@Param("roomId") String roomId, @Param("senderId") UUID senderId);

    /** 내 미읽음 0으로 */
    @Modifying(clearAutomatically = true)
    @Query("""
           update ChatRoomMember m
           set m.unreadCount = 0
           where m.room.id = :roomId
             and m.user.id = :meId
           """)
    int resetUnread(@Param("roomId") String roomId, @Param("meId") UUID meId);

    /** DM 방 기준, 내 미읽음 요약(상대 UUID 문자열, 카운트) */
    @Query("""
       select new com.realtime.chatting.chat.dto.UnreadFriendDto(
           cast(om.user.id as string),
           m.unreadCount
       )
       from ChatRoomMember m
         join m.room r
         join ChatRoomMember om on om.room = r and om.user <> m.user
       where r.type = com.realtime.chatting.chat.entity.ChatRoom.Type.DM
         and m.user.id = :meId
         and m.unreadCount > 0
       """)
    List<UnreadFriendDto> findDmUnreadOf(@Param("meId") UUID meId);

    /** 방별 내 미읽음 */
    @Query("""
       select m.unreadCount
       from ChatRoomMember m
       where m.room.id = :roomId and m.user.id = :meId
       """)
    Integer findMyUnread(@Param("roomId") String roomId, @Param("meId") UUID meId);

    /** DM 방에서 "나"의 상대(UUID 문자열) */
    @Query("""
           select cast(om.user.id as string)
           from ChatRoomMember m
             join ChatRoomMember om on om.room = m.room and om.user <> m.user
           where m.room.id = :roomId
             and m.user.id = :meId
           """)
    String findDmPeerId(@Param("roomId") String roomId, @Param("meId") UUID meId);
}
