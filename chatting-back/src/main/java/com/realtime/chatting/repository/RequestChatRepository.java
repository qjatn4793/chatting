package com.realtime.chatting.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.realtime.chatting.entity.RequestChat;

public interface RequestChatRepository extends JpaRepository<RequestChat, Long> {

}
