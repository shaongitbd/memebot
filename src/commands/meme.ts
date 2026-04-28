import { config } from '../config.js';
import { deliverImage } from '../meme/delivery.js';
import type { Handler } from './index.js';
import type { Meme } from '../types.js';

// How many candidates we try before giving up — shields against a pool
// dominated by NSFW or already-seen entries.
const MAX_PICK_ATTEMPTS = 5;

function formatCaption(meme: Meme): string {
  const stats = meme.ups ? ` · ⬆ ${meme.ups.toLocaleString()}` : '';
  return `**${meme.title}**\nr/${meme.subreddit}${stats} · ${meme.postLink}`;
}

export const handleMeme: Handler = async (ctx, { api, memes, seen }) => {
  const requested = ctx.args[0]?.toLowerCase();
  if (requested && !config.allowedSubreddits.has(requested)) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `\`r/${requested}\` isn't on the allowlist. Try \`${config.commandPrefix}memesubs\` to see what's available.`,
    });
    return;
  }

  let picked: Meme | null = null;
  for (let i = 0; i < MAX_PICK_ATTEMPTS; i++) {
    const candidate = await memes.getRandom(requested);
    if (!config.nsfwAllowed && candidate.nsfw) continue;
    if (seen.hasSeen(ctx.channelId, candidate.postLink)) continue;
    picked = candidate;
    break;
  }

  if (!picked) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Couldn't find a fresh meme right now. Try again in a sec.`,
    });
    return;
  }

  seen.markSeen(ctx.channelId, picked.postLink);
  await deliverImage({
    api,
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    imageUrl: picked.url,
    caption: formatCaption(picked),
    fallbackFilenameBase: `reddit-${picked.subreddit}`,
  });
};
