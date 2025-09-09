package com.realtime.chatting.user.repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import com.realtime.chatting.user.entity.Friendship;
import com.realtime.chatting.login.entity.User;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    List<Friendship> findByUserAndStatus(User user, Friendship.Status status);
    Optional<Friendship> findByUserAndFriend(User user, User friend);
}
