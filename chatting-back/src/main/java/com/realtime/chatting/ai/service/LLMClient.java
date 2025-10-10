package com.realtime.chatting.ai.service;

import java.util.List;

public interface LLMClient {
    /**
     * @param system   캐릭터 페르소나(System Prompt)
     * @param history  최근 N개 발화(선택)
     * @param user     사용자의 최신 메시지
     */
    String complete(String system, List<String> history, String user, Double temp, Double topP);
}
