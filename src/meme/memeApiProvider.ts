import { config } from '../config.js';
import type { Meme } from '../types.js';
import type { MemeProvider } from './memeProvider.js';

const MAX_BATCH_PER_REQUEST = 50;

// Concrete provider hitting D3vd/Meme_Api at meme-api.com. Free, no auth,
// returns a flat schema that exactly matches our Meme type.
export class MemeApiProvider implements MemeProvider {
  constructor(private readonly base: string = config.memeApiBase) {}

  async getRandom(subreddit?: string): Promise<Meme> {
    const path = subreddit ? `/gimme/${encodeURIComponent(subreddit)}` : '/gimme';
    return this.fetchJson<Meme>(path);
  }

  async getBatch(count: number, subreddit?: string): Promise<Meme[]> {
    const safe = Math.max(1, Math.min(MAX_BATCH_PER_REQUEST, count));
    const path = subreddit
      ? `/gimme/${encodeURIComponent(subreddit)}/${safe}`
      : `/gimme/${safe}`;
    const json = await this.fetchJson<{ count?: number; memes?: Meme[] }>(path);
    return json.memes ?? [];
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { 'User-Agent': 'zorium-meme-bot/1.0' },
    });
    if (!res.ok) {
      throw new Error(`meme-api ${path} failed (${res.status})`);
    }
    return (await res.json()) as T;
  }
}
