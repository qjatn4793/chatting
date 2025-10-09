package com.realtime.chatting.friend.repository;

import com.realtime.chatting.friend.entity.FriendRequest;
import com.realtime.chatting.friend.model.FriendRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {

    /* ===================== 이메일 기반 (FriendService가 사용하는 메서드) ===================== */

    // 받은 보류 요청 목록
    List<FriendRequest> findByReceiver_EmailAndStatus(String receiverEmail, FriendRequestStatus status);

    // 내가 보낸 보류 요청 목록
    List<FriendRequest> findByRequester_EmailAndStatus(String requesterEmail, FriendRequestStatus status);

    // 중복/역중복(보류/수락 상태 포함) 확인용
    Optional<FriendRequest> findByRequester_EmailAndReceiver_EmailAndStatusIn(
            String requesterEmail, String receiverEmail, List<FriendRequestStatus> statuses);

    // 수락/거절 시 본인 수신자 권한 확인
    Optional<FriendRequest> findByIdAndReceiver_Email(Long id, String receiverEmail);

    // 친구 여부(양방향) 확인용 exists
    boolean existsByStatusAndRequester_EmailAndReceiver_Email(
            FriendRequestStatus status, String requesterEmail, String receiverEmail);

    // 내 친구 목록 계산용(수락된 요청 중 requester/receiver 한쪽이 나인 것)
    List<FriendRequest> findByStatusAndRequester_EmailOrStatusAndReceiver_Email(
            FriendRequestStatus status1, String requesterEmail,
            FriendRequestStatus status2, String receiverEmail);

    /** 수신자 기준 PENDING 개수 (표준 파생 쿼리) */
    int countByReceiver_EmailAndStatus(String receiverEmail, FriendRequestStatus status);

    /** 발신자 기준 PENDING 개수 (필요시 뱃지/보조지표용) */
    int countByRequester_EmailAndStatus(String requesterEmail, FriendRequestStatus status);

}
