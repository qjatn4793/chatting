package com.realtime.chatting.chat.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import com.realtime.chatting.chat.repository.projection.LastMessageProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import com.realtime.chatting.chat.entity.ChatMessage;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    @Query(value = """
        SELECT id, room_id AS roomId, message_id AS messageId, sender, username, content, created_at AS createdAt
        FROM (
            SELECT m.*,
                   ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC, m.id DESC) AS rn
            FROM chat_messages m
            WHERE m.room_id IN (:roomIds)
        ) x
        WHERE x.rn = 1
        """, nativeQuery = true)
    List<LastMessageProjection> findLastMessagePerRoom(@Param("roomIds") List<String> roomIds);

    Optional<ChatMessage> findByMessageId(String messageId);

    // 최신 N개
    List<ChatMessage> findByRoomIdOrderByCreatedAtDesc(String roomId, Pageable pageable);

    // 커서(특정 시각 이전) 기준으로 N개
    List<ChatMessage> findByRoomIdAndCreatedAtBeforeOrderByCreatedAtDesc(
            String roomId, Instant before, Pageable pageable);
}
