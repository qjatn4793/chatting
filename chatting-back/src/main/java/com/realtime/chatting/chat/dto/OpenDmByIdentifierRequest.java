package com.realtime.chatting.chat.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class OpenDmByIdentifierRequest {
    @NotBlank
    private String identifier; // email | phone | username 중 하나
}