# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# 의존성만 먼저 복사하여 캐시 적중률 향상
COPY package*.json ./
RUN npm ci

# 소스 복사
COPY . .

# (옵션) 빌드타임 API Base (compose의 build.args와 연결)
ARG VITE_APP_NAME=chatting-front
ARG VITE_API_BASE=/api
ARG VITE_SOCKJS_PATH=/ws/
ARG VITE_ENABLE_MOCKS=false
ARG VITE_LOG_LEVEL=debug

ENV VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_SOCKJS_PATH=${VITE_SOCKJS_PATH} \
    VITE_ENABLE_MOCKS=${VITE_ENABLE_MOCKS} \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL}

# (디버그) 주입값 확인
RUN node -e "console.log(process.env.VITE_API_BASE, process.env.VITE_SOCKJS_PATH)"

RUN npm run build

# ---------- Run stage ----------
FROM nginx:alpine
# 빌드 산출물 배포
COPY --from=build /app/dist /usr/share/nginx/html

# 백엔드 프록시가 필요하면 아래 conf를 활성화
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
