package com.realtime.chatting.config;

import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    // 큐 정의
    @Bean
    public Queue queue() {
        return new Queue("chatQueue", false);  // 큐 이름: "chatQueue"
    }

    // Exchange 정의 (Topic Exchange)
    @Bean
    public TopicExchange exchange() {
        return new TopicExchange("chatExchange");  // Exchange 이름
    }

    // Queue와 Exchange 바인딩
    @Bean
    public Binding binding(Queue queue, TopicExchange exchange) {
        return BindingBuilder.bind(queue).to(exchange).with("chat.message");  // 메시지 라우팅 키
    }
}
