import { io, type Socket } from 'socket.io-client';
import { config } from '../config.js';
import { log } from '../log.js';
import type { MessageCreatedData } from '../types.js';

type MessageHandler = (data: MessageCreatedData) => void | Promise<void>;

// Suppress typing/presence/voice events — they'd flood the bot with noise it
// doesn't act on. Bits map: TYPING=1, PRESENCE=2, REACTIONS=4, VOICE_STATE=8.
const SUPPRESS_INTENTS = 1 | 2 | 8;

const HEARTBEAT_INTERVAL_MS = 25_000;

export class EchoedSocket {
  private socket: Socket | null = null;
  private messageHandler: MessageHandler | null = null;
  private botUserId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  setBotUserId(id: string): void {
    this.botUserId = id;
  }

  connect(): void {
    if (this.socket) return;

    const socket = io(config.socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      timeout: 20_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      log.info({ id: socket.id }, 'Socket connected — authenticating');
      socket.emit('authenticate', {
        botToken: config.botToken,
        suppressIntents: SUPPRESS_INTENTS,
      });
    });

    socket.on(
      'authenticated',
      (payload: { success?: boolean; user?: { id: string; name: string }; message?: string }) => {
        if (payload?.success) {
          log.info({ user: payload.user }, 'Socket authenticated');
        } else {
          log.fatal({ message: payload?.message }, 'Socket auth failed — check BOT_TOKEN');
          // Token is invalid — reconnecting won't help. Exit so the orchestrator
          // restarts with whatever new token gets injected on next deploy.
          process.exit(1);
        }
      },
    );

    // Echoed's socket server emits each event under its mapped UPPER_SNAKE
    // name (see EVENT_NAME_MAP). For new messages that's MESSAGE_CREATE, with
    // the message data passed as the bare payload (not wrapped in a
    // {type, data} envelope).
    socket.on('MESSAGE_CREATE', (data: MessageCreatedData) => {
      if (!data || !data.id) return;
      // Skip our own messages — would loop forever otherwise.
      if (this.botUserId && data.senderId === this.botUserId) return;
      Promise.resolve(this.messageHandler?.(data)).catch((err) => {
        log.error({ err }, 'Message handler threw');
      });
    });

    socket.on('disconnect', (reason) => {
      log.warn({ reason }, 'Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      log.error({ err: err.message }, 'Socket connection error');
    });

    // Periodic heartbeat keeps presence alive on the server side. The token
    // payload is required — Echoed's heartbeat handler runs validateToken on
    // every call (TypeError if data is missing) and uses the result to refresh
    // the bot's online state.
    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { botToken: config.botToken });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
