import { config } from '../config.js';
import { registry, type Handler } from './index.js';

export const handleHelp: Handler = async (ctx, { api }) => {
  const lines = [`**Meme bot — commands** (prefix: \`${config.commandPrefix}\`)`];
  for (const c of registry) {
    lines.push(`\`${config.commandPrefix}${c.name}\` — ${c.help}`);
  }
  lines.push(
    '',
    `NSFW: ${config.nsfwAllowed ? 'allowed' : 'filtered'} · pool TTL: ${Math.round(config.cacheTtlMs / 60_000)}m · cooldown: ${config.perChannelCooldownMs}ms`,
  );
  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
