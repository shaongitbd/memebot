import { config } from '../config.js';
import { findTemplate, buildMemeUrl, CURATED } from '../meme/memegen.js';
import { deliverImage } from '../meme/delivery.js';
import type { Handler } from './index.js';

const MAX_LINES = 5;
const MAX_LINE_LENGTH = 80;

function pickRandomCurated() {
  const idx = Math.floor(Math.random() * CURATED.length);
  return CURATED[idx]!;
}

// `!makememe <template> <line1> | <line2> | ...`
// Lines are pipe-delimited so users can pass spaces freely. Templates with
// only one caption (e.g. change-my-mind) accept a single segment.
// `<template>` can also be `random` — picks one from the curated short-list.
export const handleMakeMeme: Handler = async (ctx, { api }) => {
  const templateArg = ctx.args[0]?.toLowerCase();
  if (!templateArg) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${config.commandPrefix}makememe <template> <top> | <bottom>\`\nList templates with \`${config.commandPrefix}memetemplates\` or search with \`${config.commandPrefix}memesearch <name>\`. Use \`random\` as the template for a surprise pick.`,
    });
    return;
  }

  let templateId: string;
  if (templateArg === 'random') {
    templateId = pickRandomCurated().id;
  } else {
    const template = await findTemplate(templateArg);
    if (!template) {
      await api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `No template called \`${templateArg}\`. Try \`${config.commandPrefix}memesearch <name>\` to find one.`,
      });
      return;
    }
    templateId = template.id;
  }

  const captionRaw = ctx.args.slice(1).join(' ').trim();
  const lines = captionRaw
    ? captionRaw
        .split('|')
        .map((s) => s.trim().slice(0, MAX_LINE_LENGTH))
        .slice(0, MAX_LINES)
    : [];

  const url = buildMemeUrl({ templateId, lines });

  await deliverImage({
    api,
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    imageUrl: url,
    caption: '',
    fallbackFilenameBase: templateId,
  });
};
