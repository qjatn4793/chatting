package com.realtime.chatting.login.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.realtime.chatting.login.entity.User;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByUsername(String username);
}