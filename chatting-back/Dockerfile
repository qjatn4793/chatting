# ---------- Build stage ----------
FROM gradle:8.8-jdk17-alpine AS build
WORKDIR /workspace

# (캐시 최적화) 의존성 관련 파일만 먼저 복사
COPY build.gradle settings.gradle ./
# 필요하면 gradle.properties도
# COPY gradle.properties ./

# 의존성 프리캐시 (소스 없이도 가능)
RUN gradle dependencies --no-daemon || true

# 소스 복사
COPY . .

# 테스트는 이미지 빌드시 제외(속도↑), 필요시 제거
RUN gradle clean bootJar -x test --no-daemon

# ---------- Run stage ----------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /workspace/build/libs/*SNAPSHOT.jar /app/app.jar
EXPOSE 8080
ENV JAVA_OPTS=""
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
