import type { WebSocket } from '@fastify/websocket';

interface ConnectedClient {
  userId: string;
  socket: WebSocket;
  lastPing: number;
}

export class SignalHub {
  private clients = new Map<string, Set<ConnectedClient>>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  handleConnection(socket: WebSocket, userId: string): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    const client: ConnectedClient = { userId, socket, lastPing: Date.now() };
    this.clients.get(userId)!.add(client);

    socket.on('message', (raw: unknown) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'ping') {
          client.lastPing = Date.now();
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) this.clients.delete(userId);
      }
    });

    socket.on('error', () => {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) this.clients.delete(userId);
      }
    });
  }

  broadcast(userId: string, data: Record<string, unknown>): void {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const msg = JSON.stringify(data);
    for (const client of userClients) {
      if (client.socket.readyState === 1) {
        client.socket.send(msg);
      }
    }
  }

  startCleanup(): void {
    // Remove stale connections every 60s (no ping in 90s)
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [userId, clients] of this.clients) {
        for (const client of clients) {
          if (now - client.lastPing > 90_000) {
            client.socket.close();
            clients.delete(client);
          }
        }
        if (clients.size === 0) this.clients.delete(userId);
      }
    }, 60_000);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getConnectedCount(): number {
    let count = 0;
    for (const clients of this.clients.values()) count += clients.size;
    return count;
  }
}
