import { config } from '../config.js';
import type { Handler } from './index.js';

export const handleSubs: Handler = async (ctx, { api }) => {
  const subs = Array.from(config.allowedSubreddits).sort();
  const defaults = new Set(config.defaultSubreddits);
  const formatted = subs.map((s) => (defaults.has(s) ? `★ r/${s}` : `r/${s}`)).join(' · ');
  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `**Available subreddits** (★ = in default rotation)\n${formatted}\n\nUse \`${config.commandPrefix}meme <subreddit>\` to pick one.`,
  });
};
