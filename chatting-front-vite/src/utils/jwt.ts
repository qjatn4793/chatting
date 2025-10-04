// utils/jwt.ts
export type JwtClaims = {
    sub?: string;       // UUID
    email?: string;     // 이메일
    name?: string;      // 표시명
    exp?: number;
    iat?: number;
    [k: string]: unknown;
};

function safeAtob(b64url: string): string {
    // base64url → base64
    const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
    const b64 = pad(b64url.replace(/-/g, '+').replace(/_/g, '/'));
    try { return atob(b64); } catch { return ''; }
}

export function parseJwt(token: string | null | undefined): JwtClaims | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        const json = safeAtob(parts[1]);
        return JSON.parse(json) as JwtClaims;
    } catch {
        return null;
    }
}

// ✅ 기존 함수는 UUID용으로 의미를 명확히 (이름 변경)
export function getUserUuidFromToken(token: string | null | undefined): string | null {
    return parseJwt(token)?.sub ?? null;
}

// ✅ 이메일 추출
export function getEmailFromToken(token: string | null | undefined): string | null {
    const c = parseJwt(token);
    const email = (c?.email ?? '') as string;
    return email && /\S+@\S+\.\S+/.test(email) ? email : null;
}

// (옵션) 표시명
export function getNameFromToken(token: string | null | undefined): string | null {
    return (parseJwt(token)?.name ?? null) as string | null;
}
