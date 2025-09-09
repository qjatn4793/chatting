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
@EnableRabbit
public class RabbitConfig {
    public static final String EXCHANGE_NAME = "chatExchange";
    public static final String ROUTING_KEY = "chat.message";
    public static final String QUEUE_NAME = "chatQueue";

    @Bean TopicExchange chatExchange() { return new TopicExchange(EXCHANGE_NAME, true, false); }
    @Bean Queue chatQueue() { return new Queue(QUEUE_NAME, true); }
    @Bean Binding chatBinding(Queue q, TopicExchange ex) { return BindingBuilder.bind(q).to(ex).with(ROUTING_KEY); }
    @Bean MessageConverter messageConverter() { return new Jackson2JsonMessageConverter(); }

    @Bean RabbitTemplate rabbitTemplate(ConnectionFactory cf, MessageConverter mc) {
        RabbitTemplate t = new RabbitTemplate(cf);
        t.setMessageConverter(mc);
        return t;
    }

    @Bean SimpleMessageListenerContainer container(ConnectionFactory cf, MessageListenerAdapter adapter) {
        SimpleMessageListenerContainer c = new SimpleMessageListenerContainer(cf);
        c.setQueueNames(QUEUE_NAME);
        c.setMessageListener(adapter);
        c.setConcurrentConsumers(2);
        c.setMaxConcurrentConsumers(10);
        return c;
    }

    @Bean MessageListenerAdapter listenerAdapter(ChatMessageReceiver r, MessageConverter mc) {
        MessageListenerAdapter a = new MessageListenerAdapter(r, "receiveMessage");
        a.setMessageConverter(mc);
        return a;
    }
}