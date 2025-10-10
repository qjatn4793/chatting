package com.realtime.chatting.ai.service.impl;

import com.realtime.chatting.ai.service.LLMClient;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.*;

@Component
@RequiredArgsConstructor
public class OpenAIClient implements LLMClient {

    @Value("${llm.openai.endpoint:https://api.openai.com/v1/chat/completions}")
    private String endpoint;

    @Value("${llm.openai.model:gpt-4o-mini}")
    private String model;

    @Value("${llm.openai.apiKey:}")
    private String apiKey;

    private final RestClient rest = RestClient.create();

    @Override
    public String complete(String system, List<String> history, String user, Double temp, Double topP) {
        if (apiKey == null || apiKey.isBlank()) {
            // 데모/개발 환경에서는 더미 응답
            return "안녕하세요! (데모 응답) 질문을 좀 더 자세히 알려주시면 구체적으로 도와드릴게요.";
        }
        var messages = new ArrayList<Map<String, String>>();
        if (system != null && !system.isBlank()) {
            messages.add(Map.of("role","system","content", system));
        }
        if (history != null) {
            for (String h : history) messages.add(Map.of("role","user","content", h));
        }
        messages.add(Map.of("role","user","content", user));

        Map<String, Object> body = new HashMap<>();
        body.put("model", model);
        body.put("messages", messages);
        if (temp != null) body.put("temperature", temp);
        if (topP != null) body.put("top_p", topP);

        var resp = rest.post()
                .uri(endpoint)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toEntity(Map.class);

        Map<?,?> m = resp.getBody();
        try {
            var choices = (List<Map<String,Object>>) m.get("choices");
            var msg = (Map<String,Object>) choices.get(0).get("message");
            return String.valueOf(msg.get("content"));
        } catch (Exception e) {
            return "죄송합니다. 지금은 답변을 생성할 수 없습니다.";
        }
    }
}
