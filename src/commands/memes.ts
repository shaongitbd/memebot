import { config } from '../config.js';
import type { Handler } from './index.js';

const MAX_BATCH = 5;
const INTER_MESSAGE_DELAY_MS = 400;

export const handleMemes: Handler = async (ctx, { api, memes, seen }) => {
  const countArg = parseInt(ctx.args[0] ?? '3', 10);
  const count = Number.isFinite(countArg) ? Math.max(1, Math.min(MAX_BATCH, countArg)) : 3;

  const requested = ctx.args[1]?.toLowerCase();
  if (requested && !config.allowedSubreddits.has(requested)) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `\`r/${requested}\` isn't on the allowlist. Use \`${config.commandPrefix}memesubs\` to see what's available.`,
    });
    return;
  }

  // Overfetch so we have headroom to skip NSFW and already-seen entries.
  const batch = await memes.getBatch(count * 3, requested);
  const picked: typeof batch = [];
  for (const m of batch) {
    if (picked.length === count) break;
    if (!config.nsfwAllowed && m.nsfw) continue;
    if (seen.hasSeen(ctx.channelId, m.postLink)) continue;
    picked.push(m);
  }

  if (picked.length === 0) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Came up empty. Try again or use \`${config.commandPrefix}meme\` instead.`,
    });
    return;
  }

  for (const m of picked) seen.markSeen(ctx.channelId, m.postLink);

  // One sendMessage per post. Stagger keeps us under Echoed's 20-req/min
  // budget and avoids dumping all 5 at once.
  for (const m of picked) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: m.url,
    });
    await new Promise((r) => setTimeout(r, INTER_MESSAGE_DELAY_MS));
  }
};
