package com.realtime.chatting.friend.repository;

import com.realtime.chatting.friend.entity.Friendship;
import com.realtime.chatting.login.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    List<Friendship> findByOwner(User owner);
    Optional<Friendship> findByOwnerAndFriend(User owner, User friend);
    long deleteByOwnerAndFriend(User owner, User friend);
}