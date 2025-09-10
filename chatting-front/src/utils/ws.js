import SockJS from 'sockjs-client';
import Stomp from 'stompjs';

let client = null;

export function connectWS(serverBase, onConnect, onError) {
  const sock = new SockJS(`${serverBase}/ws`);
  client = Stomp.over(sock);
  client.heartbeat.outgoing = 10000;
  client.heartbeat.incoming = 0;
  client.debug = null; // 로그 줄이기

  client.connect({}, () => onConnect && onConnect(client), (err) => onError && onError(err));
}

export function disconnectWS() {
  if (client && client.connected) client.disconnect();
  client = null;
}

export function subscribe(topic, cb) {
  if (!client) return null;
  return client.subscribe(topic, (frame) => {
    try {
      cb(JSON.parse(frame.body));
    } catch {
      cb(frame.body);
    }
  });
}

export function getClient() {
  return client;
}
