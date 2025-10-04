package com.realtime.chatting.login.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.realtime.chatting.login.entity.User;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);        // email은 소문자로 저장/조회
    Optional<User> findByPhoneNumber(String phone);  // E.164로 저장/조회
    Optional<User> findByUsername(String username);
    boolean existsByEmail(String email);
    boolean existsByPhoneNumber(String phone);

    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmailCi(@Param("email") String email);
}