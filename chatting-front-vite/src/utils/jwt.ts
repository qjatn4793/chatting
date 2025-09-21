export function decodeJwt(token: string) {
  if (!token || typeof token !== 'string') return null;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    // base64 padding 보정
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);

    const jsonPayload = decodeURIComponent(
      Array.from(atob(base64))
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/** 토큰에서 로그인 ID 추출(sub/username/user 순) */
export function getLoginIdFromToken(token: string) {
  const p = decodeJwt(token) || {};
  return p.sub || p.username || p.user || null;
}