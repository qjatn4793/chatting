// lib/jwt.ts
export type JwtClaims = {
    sub?: string;       // UUID
    email?: string;     // 이메일
    name?: string;      // 표시명
    exp?: number;
    iat?: number;
    [k: string]: unknown;
};

/** Base64URL 문자열을 UTF-8 문자열로 변환 */
function b64urlToUtf8(b64url: string): string {
    // base64url -> base64 (+ padding)
    const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
    const b64 = pad(b64url.replace(/-/g, '+').replace(/_/g, '/'));

    // atob로 바이너리 문자열 획득
    let binary = '';
    try {
        binary = atob(b64);
    } catch {
        return '';
    }

    // 바이너리 문자열 -> Uint8Array
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // UTF-8 디코딩 (TextDecoder 우선, 폴백은 percent-decoding)
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
        // 폴백: %hh 시퀀스로 변환 후 decodeURIComponent
        const pct = Array.from(bytes)
            .map((b) => '%' + b.toString(16).padStart(2, '0'))
            .join('');
        try {
            return decodeURIComponent(pct);
        } catch {
            return '';
        }
    }
}

export function parseJwt(token: string | null | undefined): JwtClaims | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        const json = b64urlToUtf8(parts[1]); // ✅ UTF-8로 복원된 JSON 문자열
        return JSON.parse(json) as JwtClaims;
    } catch {
        return null;
    }
}

// 기존 함수는 UUID용으로 의미를 명확히 (이름 변경)
export function getUserUuidFromToken(token: string | null | undefined): string | null {
    return parseJwt(token)?.sub ?? null;
}

// 이메일 추출
export function getEmailFromToken(token: string | null | undefined): string | null {
    const c = parseJwt(token);
    const email = (c?.email ?? '') as string;
    return email && /\S+@\S+\.\S+/.test(email) ? email : null;
}

// (옵션) 표시명
export function getNameFromToken(token: string | null | undefined): string | null {
    const c = parseJwt(token);
    // 필요 시 대체 클레임도 함께 고려 가능: preferred_username, nickname 등
    return (c?.name as string) ?? null;
}
