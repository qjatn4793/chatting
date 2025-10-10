package com.realtime.chatting.ai.repository;

import com.realtime.chatting.ai.entity.RoomAiMember;
import com.realtime.chatting.ai.entity.RoomAiMemberId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoomAiMemberRepository extends JpaRepository<RoomAiMember, RoomAiMemberId> {
    List<RoomAiMember> findByIdRoomId(String roomId);
    boolean existsByIdRoomIdAndIdAgentId(String roomId, String agentId);
}
