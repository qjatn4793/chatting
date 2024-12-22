package com.realtime.chatting.entity;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
public class RequestChat {
	
	@Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) // 자동 증가 방식
    private Long seq;
	
	private String message;
	private String sender;
}
