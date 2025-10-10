package com.realtime.chatting.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "chatExecutor")
    public Executor chatExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setThreadNamePrefix("chat-");
        ex.setCorePoolSize(8);
        ex.setMaxPoolSize(32);
        ex.setQueueCapacity(500);
        ex.setKeepAliveSeconds(60);
        ex.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        ex.initialize();
        return ex;
    }

    @Bean(name = "aiExecutor")
    public Executor aiExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setThreadNamePrefix("ai-");
        ex.setCorePoolSize(8);        // LLM I/O 지연 고려
        ex.setMaxPoolSize(32);
        ex.setQueueCapacity(200);
        ex.setKeepAliveSeconds(60);
        ex.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        ex.initialize();
        return ex;
    }
}
