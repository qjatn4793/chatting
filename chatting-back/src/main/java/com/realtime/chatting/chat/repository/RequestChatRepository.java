package com.realtime.chatting.chat.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.realtime.chatting.chat.entity.RequestChat;

public interface RequestChatRepository extends JpaRepository<RequestChat, Long> {

}
