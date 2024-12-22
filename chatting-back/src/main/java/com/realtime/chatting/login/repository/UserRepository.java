package com.realtime.chatting.login.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.realtime.chatting.login.entity.User;

public interface UserRepository extends JpaRepository<User, String> {
    User findByUsername(String username);
}