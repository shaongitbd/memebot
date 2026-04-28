import { config } from '../config.js';
import { log } from '../log.js';
import type { Meme } from '../types.js';
import type { MemeProvider } from './memeProvider.js';

interface Pool {
  memes: Meme[];
  expiresAt: number;
  refreshing: boolean;
}

const POOL_FILL = 50;
const COOLDOWN_AFTER_FAILURE_MS = 30_000;

// In-memory pool cache. Each subreddit gets its own pool of ~50 memes, refilled
// lazily on miss/expiry and refreshed in the background when running low. We
// pop random items (rather than indexing without removal) so users get variety
// inside a single TTL window without us needing a per-user history.
export class CachedMemeProvider implements MemeProvider {
  private readonly pools = new Map<string, Pool>();

  constructor(
    private readonly upstream: MemeProvider,
    private readonly defaults: string[] = config.defaultSubreddits,
    private readonly ttlMs: number = config.cacheTtlMs,
    private readonly refreshAt: number = config.cacheRefreshAt,
  ) {}

  async getRandom(subreddit?: string): Promise<Meme> {
    const key = (subreddit ?? this.pickDefault()).toLowerCase();
    const pool = await this.ensurePool(key);
    if (pool.memes.length === 0) {
      // Pool is empty (fill failed). Last-resort direct fetch so the user still
      // gets a meme rather than an error.
      return this.upstream.getRandom(key);
    }

    const idx = Math.floor(Math.random() * pool.memes.length);
    const [picked] = pool.memes.splice(idx, 1);

    if (pool.memes.length <= this.refreshAt && !pool.refreshing) {
      void this.refreshInBackground(key);
    }
    return picked!;
  }

  async getBatch(count: number, subreddit?: string): Promise<Meme[]> {
    // Batch bypasses the pool — typical use is `!memes 5` which we want fresh
    // and contiguous, not randomized from the rotation.
    return this.upstream.getBatch(count, subreddit ?? this.pickDefault());
  }

  private pickDefault(): string {
    if (this.defaults.length === 0) return 'memes';
    const idx = Math.floor(Math.random() * this.defaults.length);
    return this.defaults[idx]!;
  }

  private async ensurePool(key: string): Promise<Pool> {
    const existing = this.pools.get(key);
    const now = Date.now();
    if (existing && existing.expiresAt > now && existing.memes.length > 0) {
      return existing;
    }

    const fresh = await this.fillPool(key);
    this.pools.set(key, fresh);
    return fresh;
  }

  private async refreshInBackground(key: string): Promise<void> {
    const existing = this.pools.get(key);
    if (existing) existing.refreshing = true;
    try {
      const fresh = await this.fillPool(key);
      this.pools.set(key, fresh);
      log.debug({ subreddit: key, count: fresh.memes.length }, 'Pool refreshed');
    } catch (err) {
      log.warn({ err, subreddit: key }, 'Pool refresh failed');
      if (existing) existing.refreshing = false;
    }
  }

  private async fillPool(key: string): Promise<Pool> {
    try {
      const memes = await this.upstream.getBatch(POOL_FILL, key);
      return {
        memes: memes.filter((m) => m && typeof m.url === 'string' && m.url.length > 0),
        expiresAt: Date.now() + this.ttlMs,
        refreshing: false,
      };
    } catch (err) {
      log.warn({ err, subreddit: key }, 'Pool fill failed');
      // Short cooldown so we don't hammer a failing upstream.
      return { memes: [], expiresAt: Date.now() + COOLDOWN_AFTER_FAILURE_MS, refreshing: false };
    }
  }
}
