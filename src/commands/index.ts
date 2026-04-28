import { config } from '../config.js';
import { log } from '../log.js';
import type { EchoedClient } from '../client/echoedClient.js';
import type { CachedMemeProvider } from '../meme/cachedProvider.js';
import type { SeenTracker } from '../meme/seenTracker.js';
import type { CommandContext } from '../types.js';

import { handleMeme } from './meme.js';
import { handleMemes } from './memes.js';
import { handleMakeMeme } from './makememe.js';
import { handleMemeTemplates } from './memetemplates.js';
import { handleMemeSearch } from './memesearch.js';
import { handleHelp } from './help.js';
import { handleSubs } from './subs.js';
import { handlePing } from './ping.js';

export interface Services {
  api: EchoedClient;
  memes: CachedMemeProvider;
  seen: SeenTracker;
  startedAt: number;
}

export type Handler = (ctx: CommandContext, svc: Services) => Promise<void>;

interface Registered {
  name: string;
  aliases: readonly string[];
  handler: Handler;
  help: string;
}

// Order is the order help prints them in.
export const registry: readonly Registered[] = [
  {
    name: 'meme',
    aliases: [],
    handler: handleMeme,
    help: 'random meme — `meme` or `meme <subreddit>`',
  },
  {
    name: 'memes',
    aliases: ['memebatch'],
    handler: handleMemes,
    help: 'batch — `memes <count>` (1–5)',
  },
  {
    name: 'makememe',
    aliases: ['gen', 'generate'],
    handler: handleMakeMeme,
    help: 'generate — `makememe <template> <top> | <bottom>` (or `random`)',
  },
  {
    name: 'memetemplates',
    aliases: ['templates'],
    handler: handleMemeTemplates,
    help: 'list popular meme templates',
  },
  {
    name: 'memesearch',
    aliases: ['searchmeme'],
    handler: handleMemeSearch,
    help: 'search the full memegen catalog — `memesearch <name>`',
  },
  {
    name: 'memesubs',
    aliases: ['subs'],
    handler: handleSubs,
    help: 'list allowed subreddits',
  },
  {
    name: 'memehelp',
    aliases: ['help'],
    handler: handleHelp,
    help: 'show this list',
  },
  {
    name: 'memeping',
    aliases: ['ping'],
    handler: handlePing,
    help: 'health check + uptime',
  },
];

const cooldowns = new Map<string, number>();

function isOnCooldown(channelId: string): boolean {
  const last = cooldowns.get(channelId) ?? 0;
  return Date.now() - last < config.perChannelCooldownMs;
}

function markCooldown(channelId: string): void {
  cooldowns.set(channelId, Date.now());
}

function findCommand(token: string): Registered | undefined {
  const lower = token.toLowerCase();
  return registry.find((c) => c.name === lower || c.aliases.includes(lower));
}

interface DispatchInput {
  serverId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  messageId: string;
}

export async function dispatch(
  rawContent: string,
  msg: DispatchInput,
  svc: Services,
): Promise<void> {
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith(config.commandPrefix)) return;

  const tokens = trimmed.slice(config.commandPrefix.length).split(/\s+/);
  const head = tokens.shift();
  if (!head) return;

  const command = findCommand(head);
  if (!command) return;

  if (isOnCooldown(msg.channelId)) {
    log.debug({ channelId: msg.channelId, command: command.name }, 'Cooldown — skipping');
    return;
  }
  markCooldown(msg.channelId);

  const ctx: CommandContext = {
    serverId: msg.serverId,
    channelId: msg.channelId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    messageId: msg.messageId,
    args: tokens,
    rawContent,
  };

  log.info(
    { command: command.name, args: ctx.args, channelId: ctx.channelId, sender: ctx.senderName },
    'Dispatching',
  );

  try {
    await command.handler(ctx, svc);
  } catch (err) {
    log.error({ err, command: command.name, channelId: ctx.channelId }, 'Command handler threw');
    try {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Something broke running \`${config.commandPrefix}${command.name}\`. Try again in a moment.`,
      });
    } catch {
      // Already in error path — don't cascade.
    }
  }
}
