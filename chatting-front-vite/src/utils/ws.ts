// import SockJS from 'sockjs-client';
// import Stomp from 'stompjs';

// let client: Stomp.Client | null = null;

// export function connectWS(
//   serverBase: string,
//   token: string | null,
//   onConnect?: (client: any) => void,
//   onError?: (err: any) => void
// ) {
//   const sock = new SockJS(`${serverBase}/ws`);
//   client = Stomp.over(sock);
//   client.heartbeat.outgoing = 10000;
//   client.heartbeat.incoming = 0;
//   client.debug = () => {}; // 로그 줄이기

//   const headers = token ? { Authorization: `Bearer ${token}` } : {};
//   client.connect(headers, () => onConnect && onConnect?.(client), (err) => onError?.(err));
// }

// export function disconnectWS() {
//   if (client && client.connected) client.disconnect(() => {});
//   client = null;
// }

// export function subscribe(topic: string, cb: (data: any) => void) {
//   if (!client) return null;
//   return client.subscribe(topic, (frame) => {
//     try {
//       cb(JSON.parse(frame.body));
//     } catch {
//       cb(frame.body);
//     }
//   });
// }

// export function getClient() {
//   return client;
// }
