// Shape returned by meme-api.com (D3vd/Meme_Api). One field per Reddit attribute
// the API exposes — we only consume what's useful for the message body.
export interface Meme {
  postLink: string;
  subreddit: string;
  title: string;
  url: string;
  nsfw: boolean;
  spoiler: boolean;
  author: string;
  ups: number;
}

// Bare payload Echoed's socket server emits on the MESSAGE_CREATE event.
// (Not enveloped — the type discriminator is the event name itself.)
export interface MessageCreatedData {
  id: string;
  channelId: string;
  serverId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
  author?: { id: string; name: string; avatarUrl?: string | null };
}

// What command handlers receive after dispatch parses the message.
export interface CommandContext {
  serverId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  messageId: string;
  args: string[];
  rawContent: string;
}
