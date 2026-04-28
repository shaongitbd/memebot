import { config } from '../config.js';

// Per-channel "last N memes posted" set so the same meme doesn't appear twice
// in a row from a small cache pool. FIFO eviction once the queue exceeds maxSize.
export class SeenTracker {
  private readonly seen = new Map<string, Set<string>>();
  private readonly order = new Map<string, string[]>();

  constructor(private readonly maxSize: number = config.seenTrackerSize) {}

  hasSeen(channelId: string, memeId: string): boolean {
    return this.seen.get(channelId)?.has(memeId) ?? false;
  }

  markSeen(channelId: string, memeId: string): void {
    let set = this.seen.get(channelId);
    let queue = this.order.get(channelId);
    if (!set || !queue) {
      set = new Set();
      queue = [];
      this.seen.set(channelId, set);
      this.order.set(channelId, queue);
    }
    if (set.has(memeId)) return;

    set.add(memeId);
    queue.push(memeId);
    if (queue.length > this.maxSize) {
      const oldest = queue.shift();
      if (oldest !== undefined) set.delete(oldest);
    }
  }
}
