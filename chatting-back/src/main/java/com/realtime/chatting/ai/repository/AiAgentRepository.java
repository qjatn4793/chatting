package com.realtime.chatting.ai.repository;

import com.realtime.chatting.ai.entity.AiAgent;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AiAgentRepository extends JpaRepository<AiAgent, String> {

    @Query("""
      select a from AiAgent a
      where (:q is null or :q = ''
        or lower(a.name) like lower(concat('%', :q, '%'))
        or lower(a.intro) like lower(concat('%', :q, '%'))
        or lower(a.tags) like lower(concat('%', :q, '%')))
    """)
    Page<AiAgent> search(String q, Pageable pageable);
}