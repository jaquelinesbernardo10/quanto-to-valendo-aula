// Socket.IO autenticado no handshake com o mesmo token do painel.
import { io } from 'socket.io-client';

export function criarSocket(token) {
  return io(import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001', {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}
