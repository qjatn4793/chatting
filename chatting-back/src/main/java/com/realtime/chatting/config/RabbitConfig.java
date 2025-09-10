package com.realtime.chatting.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableRabbit
public class RabbitConfig {

    public static final String CHAT_EXCHANGE = "chatExchange";
    public static final String WS_BRIDGE_QUEUE = "chat.ws-bridge";
    // 컨트롤러에서 chat.message.room.{roomId} 로 발행
    public static final String ROUTING_KEY_PATTERN = "chat.message.room.*";

    @Bean
    public TopicExchange chatExchange() {
        return ExchangeBuilder.topicExchange(CHAT_EXCHANGE).durable(true).build();
    }

    @Bean
    public Queue wsBridgeQueue() {
        return QueueBuilder.durable(WS_BRIDGE_QUEUE).build();
    }

    @Bean
    public Binding wsBridgeBinding(Queue wsBridgeQueue, TopicExchange chatExchange) {
        return BindingBuilder.bind(wsBridgeQueue).to(chatExchange).with(ROUTING_KEY_PATTERN);
    }

    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory cf, Jackson2JsonMessageConverter conv) {
        RabbitTemplate rt = new RabbitTemplate(cf);
        rt.setMessageConverter(conv);
        return rt;
    }

    @Bean
    public SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory cf, Jackson2JsonMessageConverter conv) {
        SimpleRabbitListenerContainerFactory f = new SimpleRabbitListenerContainerFactory();
        f.setConnectionFactory(cf);
        f.setMessageConverter(conv);
        return f;
    }
}
