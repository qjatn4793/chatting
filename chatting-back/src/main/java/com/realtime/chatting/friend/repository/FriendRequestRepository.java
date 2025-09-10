package com.realtime.chatting.friend.repository;

import com.realtime.chatting.friend.entity.FriendRequest;
import com.realtime.chatting.friend.model.FriendRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {

    Optional<FriendRequest> findByRequester_UsernameAndReceiver_UsernameAndStatusIn(
            String requester, String receiver, List<FriendRequestStatus> statuses);

    List<FriendRequest> findByRequester_UsernameAndStatus(String requester, FriendRequestStatus status);
    List<FriendRequest> findByReceiver_UsernameAndStatus(String receiver, FriendRequestStatus status);

    Optional<FriendRequest> findByIdAndReceiver_Username(Long id, String receiver);

    // 친구목록 계산용: (me가 요청자거나 수신자이고 상태가 ACCEPTED)
    List<FriendRequest> findByStatusAndRequester_UsernameOrStatusAndReceiver_Username(
            FriendRequestStatus s1, String me1, FriendRequestStatus s2, String me2);
    
    // 친구 여부 체크용 exists 쿼리 (양방향 검사에 사용)
    boolean existsByStatusAndRequester_UsernameAndReceiver_Username(
            FriendRequestStatus status, String requester, String receiver);
}
