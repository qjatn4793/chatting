package com.realtime.chatting.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.MessageListenerContainer;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.amqp.rabbit.listener.adapter.MessageListenerAdapter;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.realtime.chatting.chat.controller.ChatMessageReceiver;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.core.BindingBuilder;

@Configuration
public class RabbitConfig {

	public static final String QUEUE_NAME = "chatQueue";
	
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
    
    // 메시지 변환기 (JSON 변환기 사용)
    @Bean
    public MessageConverter messageConverter() {
        return new Jackson2JsonMessageConverter();
    }
    
    // 메시지 리스너 설정
    @Bean
    public MessageListenerContainer messageListenerContainer(ConnectionFactory connectionFactory,
                                                             MessageListenerAdapter listenerAdapter) {
        SimpleMessageListenerContainer container = new SimpleMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.setQueueNames(QUEUE_NAME);
        container.setMessageListener(listenerAdapter);
        return container;
    }
    
    // 메시지 리스너 어댑터 설정
    @Bean
    public MessageListenerAdapter listenerAdapter(ChatMessageReceiver receiver, MessageConverter messageConverter) {
        // 메시지 변환기를 설정하여 바이트 배열을 자동으로 변환하도록 함
        MessageListenerAdapter adapter = new MessageListenerAdapter(receiver, "receiveMessage");
        adapter.setMessageConverter(messageConverter);
        return adapter;
    }
}
