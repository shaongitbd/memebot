import 'dotenv/config';
import { log } from './log.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    log.fatal(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const parsed = parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.toLowerCase().trim();
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function csvList(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export const config = {
  botToken: required('BOT_TOKEN'),
  apiUrl: trimTrailingSlash(optional('ECHOED_API_URL', 'https://go.echoed.gg')),
  socketUrl: trimTrailingSlash(optional('ECHOED_SOCKET_URL', 'https://socket.echoed.gg')),
  commandPrefix: optional('COMMAND_PREFIX', '!'),
  memeApiBase: trimTrailingSlash(optional('MEMEAPI_BASE', 'https://meme-api.com')),
  defaultSubreddits: csvList('DEFAULT_SUBREDDITS', [
    'memes',
    'dankmemes',
    'wholesomememes',
    'me_irl',
  ]),
  allowedSubreddits: new Set(
    csvList('ALLOWED_SUBREDDITS', [
      'memes',
      'dankmemes',
      'wholesomememes',
      'me_irl',
      'memeeconomy',
      'prequelmemes',
      'historymemes',
      'programmerhumor',
      '2meirl4meirl',
      'terriblefacebookmemes',
      'comedyheaven',
    ]),
  ),
  nsfwAllowed: optionalBool('NSFW_ALLOWED', false),
  cacheTtlMs: optionalInt('CACHE_TTL_MINUTES', 60) * 60 * 1000,
  cacheRefreshAt: optionalInt('CACHE_REFRESH_AT', 10),
  perChannelCooldownMs: optionalInt('PER_CHANNEL_COOLDOWN_MS', 2000),
  seenTrackerSize: optionalInt('SEEN_TRACKER_SIZE', 20),
} as const;

log.debug(
  {
    config: {
      ...config,
      botToken: config.botToken.slice(0, 8) + '…',
      allowedSubreddits: Array.from(config.allowedSubreddits),
    },
  },
  'Loaded config',
);
