import type { Handler } from './index.js';

function fmtUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec % 3_600) / 60);
  const s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const handlePing: Handler = async (ctx, { api, startedAt }) => {
  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🟢 alive · uptime ${fmtUptime(Date.now() - startedAt)}`,
  });
};
