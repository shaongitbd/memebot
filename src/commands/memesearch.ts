import { config } from '../config.js';
import { searchTemplates } from '../meme/memegen.js';
import type { Handler } from './index.js';

const RESULT_LIMIT = 15;

export const handleMemeSearch: Handler = async (ctx, { api }) => {
  const query = ctx.args.join(' ').trim();
  if (!query) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${config.commandPrefix}memesearch <name>\``,
    });
    return;
  }

  const results = await searchTemplates(query, RESULT_LIMIT);
  if (results.length === 0) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `No templates matched **${query}**.`,
    });
    return;
  }

  const lines = [
    `**Templates matching "${query}"** (showing ${results.length}${results.length === RESULT_LIMIT ? '+ — narrow your query for more' : ''})`,
    '',
  ];
  for (const t of results) {
    lines.push(`\`${t.id}\` — ${t.name}`);
  }
  lines.push('', `Generate one with \`${config.commandPrefix}makememe <id> top | bottom\`.`);

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
