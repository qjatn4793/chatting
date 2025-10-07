package com.realtime.chatting.chat.repository.projection;

import java.sql.Timestamp;

/**
 * 네이티브 쿼리 결과 매핑용 인터페이스 기반 프로젝션.
 * 쿼리 별칭과 동일한 이름의 getter가 있어야 함.
 *
 * SELECT ... AS roomId, ... AS messageId, ... AS createdAt ...
 * → getRoomId(), getMessageId(), getCreatedAt()
 */
public interface LastMessageProjection {
    Long getId();
    String getRoomId();
    String getMessageId();
    String getSender();
    String getUsername();
    String getContent();
    Timestamp getCreatedAt();
}