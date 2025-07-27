# chatting
간단한 실시간 채팅 애플리케이션입니다.

# 📝 소개
React, Spring Boot, Gradle, JPA를 활용한 풀스택 채팅 앱
JWT 기반 인증 및 WebSocket(STOMP) 메시징 구현

# 📦 기술 스택
Frontend
React, Context API

Backend
Spring Boot, JPA, Spring WebSocket (STOMP), Gradle

인증
JWT

빌드 도구
Gradle

통신
REST API, WebSocket

# 🚀 주요 기능
회원가입 / 로그인 (JWT)
채팅방 입장/퇴장 시스템 메시지
실시간 1:1 및 그룹 채팅
메시지 자동 스크롤
세션 만료 시 자동 로그아웃

# ⚙️ 개발 환경 설정
공통
Node.js >= 16.17.0
Java 17

Backend
cd chatting-back
./gradlew bootRun
기본 포트: http://localhost:8080

Frontend

cd frontend
.env.local 파일 생성 후, 아래 변수 설정:
REACT_APP_CHATTING_SERVER=http://localhost:8080

npm install
npm start
기본 포트: http://localhost:3000

# 🔒 인증 흐름
사용자가 로그인/회원가입 시 JWT 발급
React AuthContext를 통해 전역 관리
Axios 요청 시 Authorization: Bearer <token> 헤더 추가
토큰 만료 시 자동 로그아웃
