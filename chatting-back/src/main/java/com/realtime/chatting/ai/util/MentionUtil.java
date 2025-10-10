package com.realtime.chatting.ai.util;

public class MentionUtil {
    private static final java.util.regex.Pattern AI_MENTION =
            java.util.regex.Pattern.compile("(?i)(^|\\s)@ai(\\b|[^\\w])");
    // 설명: (?i) 대소문자무시, 공백/문서시작 + @ai + 단어경계/구두점

    public static boolean hasAiMention(String msg) {
        if (msg == null) return false;
        return AI_MENTION.matcher(msg).find();
    }

    /** LLM 프롬프트로 넘길 때 @ai를 한 번만 지워 깔끔히 보냅니다. */
    public static String stripOneAiMention(String msg) {
        if (msg == null) return null;
        return AI_MENTION.matcher(msg).replaceFirst(" "); // 첫 1회 치환
    }
}
