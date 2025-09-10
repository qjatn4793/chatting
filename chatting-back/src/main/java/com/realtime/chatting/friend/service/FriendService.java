package com.realtime.chatting.friend.service;

import com.realtime.chatting.friend.dto.FriendRequestDto;
import com.realtime.chatting.friend.model.FriendRequestStatus;
import com.realtime.chatting.friend.repository.FriendRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service @RequiredArgsConstructor
public class FriendService {

    private final FriendRequestService requestService;
    private final FriendRequestRepository requestRepo;

    @Transactional(readOnly = true)
    public List<FriendRequestDto> incomingPending(String me) {
        return requestService.incoming(me);
    }

    @Transactional(readOnly = true)
    public List<FriendRequestDto> outgoingPending(String me) {
        return requestService.outgoing(me);
    }

    @Transactional
    public FriendRequestDto sendRequest(String me, String target) {
        return requestService.send(me, target);
    }

    @Transactional
    public FriendRequestDto accept(Long id, String me) {
        return requestService.accept(id, me);
    }

    @Transactional
    public FriendRequestDto decline(Long id, String me) {
        return requestService.decline(id, me);
    }
    
    public boolean areFriends(String me, String other) {
        return requestRepo.existsByStatusAndRequester_UsernameAndReceiver_Username(
                   FriendRequestStatus.ACCEPTED, me, other)
            || requestRepo.existsByStatusAndRequester_UsernameAndReceiver_Username(
                   FriendRequestStatus.ACCEPTED, other, me);
    }

    // 친구목록 계산(ACCEPTED만)
    @Transactional(readOnly = true)
    public List<String> myFriends(String me) {
        return requestRepo
                .findByStatusAndRequester_UsernameOrStatusAndReceiver_Username(
                        FriendRequestStatus.ACCEPTED, me,
                        FriendRequestStatus.ACCEPTED, me)
                .stream()
                .map(fr -> me.equals(fr.getRequester().getUsername())
                        ? fr.getReceiver().getUsername()
                        : fr.getRequester().getUsername())
                .distinct()
                .toList();
    }
}
