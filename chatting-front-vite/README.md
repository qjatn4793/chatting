
# Vite Migration (자동 변환)

## 설치 & 실행
```bash
cd frontend-vite
npm i
npm run dev
```
- 개발 프록시: `/api` → http://localhost:8080, `/ws` → ws://localhost:8080

## 참고
- `public/` 폴더는 그대로 사용됩니다.
- CRA의 `process.env.REACT_APP_*`는 Vite에선 `import.meta.env.VITE_*`로 변경 필요합니다.
- 절대경로 import는 `@` → `/src` 별칭으로 설정했습니다.
- 엔트리 파일은 `src/main.jsx` 입니다.
