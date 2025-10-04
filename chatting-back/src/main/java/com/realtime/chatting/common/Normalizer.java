package com.realtime.chatting.common;

import org.springframework.stereotype.Component;

@Component
public class Normalizer {
    public String normalizeEmail(String email) {
        if (email == null) return null;
        return email.trim().toLowerCase();
    }

    /** 아주 단순 E.164 예시(실무는 libphonenumber 권장) */
    public String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("[^0-9+]", "");
        // 한국 예시: 010 → +8210 으로 치환(환경에 맞게 조정)
        if (digits.startsWith("010")) return "+82" + digits.substring(1);
        if (!digits.startsWith("+")) return "+" + digits; // 최소 프리픽스
        return digits;
    }

    public boolean looksLikeEmail(String s) {
        return s != null && s.contains("@");
    }
}