import type { Meme } from '../types.js';

// Provider interface exists so the cache layer (and future providers — Reddit
// direct, imgflip, server-uploaded memes) can plug in without touching the
// command handlers.
export interface MemeProvider {
  getRandom(subreddit?: string): Promise<Meme>;
  getBatch(count: number, subreddit?: string): Promise<Meme[]>;
}
