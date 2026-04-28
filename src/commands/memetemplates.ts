import { config } from '../config.js';
import { CURATED } from '../meme/memegen.js';
import type { Handler } from './index.js';

export const handleMemeTemplates: Handler = async (ctx, { api }) => {
  const lines = [
    `**Popular meme templates** — use \`${config.commandPrefix}makememe <id> top | bottom\``,
    '',
  ];
  for (const t of CURATED) {
    const linesHint = t.lines === 1 ? ' (single caption)' : '';
    lines.push(`\`${t.id}\` — **${t.name}**${linesHint} · ${t.description}`);
  }
  lines.push('', `Search the full catalog with \`${config.commandPrefix}memesearch <name>\`.`);

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
