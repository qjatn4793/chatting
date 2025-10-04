package com.realtime.chatting.login.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest (
	@NotBlank @JsonAlias({"email","phone"}) String identifier,
    @NotBlank String password
) {}
