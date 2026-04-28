import { config } from './config.js';
import { log } from './log.js';
import { EchoedClient } from './client/echoedClient.js';
import { EchoedSocket } from './client/echoedSocket.js';
import { MemeApiProvider } from './meme/memeApiProvider.js';
import { CachedMemeProvider } from './meme/cachedProvider.js';
import { SeenTracker } from './meme/seenTracker.js';
import { dispatch, type Services } from './commands/index.js';

async function main(): Promise<void> {
  const api = new EchoedClient(config.botToken);

  // Validate token + capture identity. Without `id` we can't dedup our own
  // outbound messages on the socket and we'd loop forever.
  let botUserId: string;
  try {
    const profile = await api.getProfile();
    botUserId = profile.id;
    log.info(
      { id: profile.id, name: profile.name, username: profile.username },
      'Bot identity confirmed',
    );
  } catch (err) {
    log.fatal({ err }, 'Failed to load bot profile — is BOT_TOKEN valid?');
    process.exit(1);
  }

  const memes = new CachedMemeProvider(new MemeApiProvider());
  const seen = new SeenTracker();
  const services: Services = {
    api,
    memes,
    seen,
    startedAt: Date.now(),
  };

  const socket = new EchoedSocket();
  socket.setBotUserId(botUserId);
  socket.onMessage(async (msg) => {
    if (!msg.content || msg.messageType !== 'user') return;
    if (!msg.serverId || !msg.channelId) return;

    await dispatch(
      msg.content,
      {
        serverId: msg.serverId,
        channelId: msg.channelId,
        senderId: msg.senderId,
        senderName: msg.author?.name ?? 'unknown',
        messageId: msg.id,
      },
      services,
    );
  });
  socket.connect();

  const shutdown = (signal: string): void => {
    log.info({ signal }, 'Shutting down');
    socket.disconnect();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the process alive on async errors — restarts are expensive and most
  // command handler errors are already swallowed inside the dispatcher.
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'Uncaught exception — staying alive');
  });
  process.on('unhandledRejection', (err) => {
    log.error({ err }, 'Unhandled rejection — staying alive');
  });
}

void main();
