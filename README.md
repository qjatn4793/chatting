# chatting
간단한 실시간 채팅 애플리케이션입니다.

## 📝 소개
React와 Spring Boot를 활용하여 풀스택으로 개발된 실시간 채팅 애플리케이션입니다.  
JWT 기반 인증과 WebSocket(STOMP)을 사용하여 실시간 메시징을 구현했습니다.

---

## 📦 기술 스택
### Frontend
- React
- Context API
- Axios
- SockJS
- STOMP.js

### Backend
- Spring Boot
- JPA
- Spring WebSocket (STOMP)
- RabbitMQ
- Gradle

### 인증
- JWT (JSON Web Token)

### 빌드 도구
- Gradle

### 통신
- REST API
- WebSocket

---

## 🚀 주요 기능
### 공통
- JWT 기반 인증
- REST API와 WebSocket을 활용한 통신

### Frontend
- 회원가입 및 로그인
- 채팅방 입장/퇴장
- 실시간 1:1 및 그룹 채팅
- 메시지 자동 스크롤
- 세션 만료 시 자동 로그아웃

### Backend
- 사용자 인증 및 JWT 발급
- WebSocket을 통한 실시간 메시지 브로드캐스트
- RabbitMQ를 활용한 메시지 큐 처리
- MariaDB를 통한 데이터 영속화

---

## ⚙️ 개발 환경 설정
### 공통
- Node.js >= 16.17.0
- Java 17
- MariaDB
- RabbitMQ

---

### Backend
1. **환경 설정**
   - chatting-back/src/main/resources/application.properties에서 데이터베이스 및 RabbitMQ 설정 확인
   - 기본 포트: http://localhost:8080

2. **실행**
   - cd chatting-back
   - ./gradlew bootRun
3. **Docker Compose 사용 (선택)**
   - chatting-back/docker/docker-compose.yml 파일을 사용하여 MariaDB와 RabbitMQ를 실행할 수 있습니다.
   - cd chatting-back/docker
   - docker-compose up

### Frontend
1. **환경 설정**
   - chatting-front/.env 파일 생성 후 아래와 같이 설정:
   - REACT_APP_CHATTING_SERVER=http://localhost:8080

2. **실행**
   - cd chatting-front
   - npm install
   - npm start
3. **기본 포트**
   - http://localhost:3000

### 🔒 인증 흐름
  - 사용자가 로그인 또는 회원가입 시 JWT 발급
  - React의 AuthContext를 통해 JWT를 전역 관리
  - Axios 요청 시<vscode_annotation details='%5B%7B%22title%22%3A%22hardcoded-credentials%22%2C%22description%22%3A%22Embedding%20credentials%20in%20source%20code%20risks%20unauthorized%20access%22%7D%5D'> </vscode_annotation>Authorization: Bearer <토큰> 헤더 추가
  - 토큰 만료 시 자동 로그아웃 처리

### 📂 프로젝트 구조
  ### Frontend (`chatting-front`)
   ```
   chatting-front/
   ├── public/                # 정적 파일 (HTML, manifest 등)
   ├── src/
   │   ├── components/        # 재사용 가능한 컴포넌트
   │   ├── context/           # AuthContext (JWT 관리)
   │   ├── pages/             # 페이지 컴포넌트 (로그인, 채팅)
   │   ├── styles/            # CSS 스타일 파일
   │   ├── App.js             # 메인 애플리케이션 컴포넌트
   │   └── index.js           # React 진입점
   ├── .env                   # 환경 변수 설정
   └── package.json           # 프로젝트 의존성 및 스크립트
   ```
  ### Backend (`chatting-back`)
   ```
   chatting-back/
   ├── src/
   │   ├── main/
   │   │   ├── java/com/realtime/chatting/
   │   │   │   ├── config/               # 설정 파일 (WebSocket, JWT, RabbitMQ 등)
   │   │   │   ├── login/                # 로그인 관련 엔티티, 레포지토리, 컨트롤러
   │   │   │   ├── chat/                 # 채팅 관련 엔티티, 서비스, 컨트롤러
   │   │   │   └── ChattingApplication.java # Spring Boot 진입점
   │   │   └── resources/
   │   │       ├── application.properties # 환경 설정 파일
   │   │       └── static/               # 정적 리소스
   │   └── test/                         # 테스트 코드
   ├── build.gradle                      # Gradle 빌드 설정
   ├── settings.gradle                   # Gradle 프로젝트 설정
   └── docker/                           # Docker Compose 설정
   ```
### 🛠️ 빌드 및 배포
```
  Frontend
    cd chatting-front
    npm run build
  Backend
    cd chatting-back
    ./gradlew build
```

### db index 추가 항목들
-- messages: 방/시간 순회
CREATE INDEX idx_msg_room_created     ON chat_messages (room_id, created_at);
-- messages: "내 메시지 제외" + 시간
CREATE INDEX idx_msg_room_sender_time ON chat_messages (room_id, sender, created_at);
-- room_members: 조인/PK
CREATE INDEX idx_rm_user              ON chat_room_members (user_id);
CREATE INDEX idx_rm_room              ON chat_room_members (room_id);

### 해야할것들
1. 대화방 메세지 읽음 처리
2. 그룹 대화방 기능 추가
3. 프로필 업로드 기능 추가