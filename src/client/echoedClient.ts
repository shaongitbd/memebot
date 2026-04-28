import { config } from '../config.js';
import { log } from '../log.js';

export class EchoedApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'EchoedApiError';
  }
}

interface SendMessageInput {
  serverId: string;
  channelId: string;
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
}

interface SendMessageResponse {
  message: string;
  messageId: string;
  channelId: string;
  content: string;
}

interface BotProfileResponse {
  id: string;
  name: string;
  username: string;
  isBot: true;
  metadata?: Record<string, unknown>;
  stats?: { serverCount?: number };
}

interface UploadAttachmentInput {
  serverId: string;
  channelId: string;
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

interface UploadAttachmentResponse {
  success?: boolean;
  fileId: string;
  filename?: string;
  size?: number;
  contentType?: string;
  url?: string;
}

// Echoed wraps every bot-auth failure in { message, code, type }; non-auth
// errors are usually { message, code } with an occasional { error } for 5xx.
// We normalize to { status, code, message } so callers don't have to care.
export class EchoedClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = config.apiUrl,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'X-Bot-Token': this.token,
        'Content-Type': 'application/json',
        'User-Agent': 'zorium-meme-bot/1.0',
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.error === 'string' && obj.error) ||
        `HTTP ${res.status}`;
      const code = typeof obj.code === 'number' ? obj.code : undefined;
      log.warn({ method, path, status: res.status, message, body: obj }, 'Echoed API error');
      throw new EchoedApiError(res.status, code, message);
    }
    return parsed as T;
  }

  async validate(): Promise<{ valid: boolean; bot_id: string }> {
    return this.request('GET', '/v1/bots/validate');
  }

  async getProfile(): Promise<BotProfileResponse> {
    return this.request('GET', '/v1/bots/profile');
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
    const { serverId, channelId, content, replyToId, attachmentIds } = input;
    return this.request('POST', `/v1/bots/${serverId}/messages/send`, {
      channelId,
      content,
      ...(replyToId ? { replyToId } : {}),
      ...(attachmentIds ? { attachmentIds } : {}),
    });
  }

  // Multipart upload to /v1/bots/:server_id/upload/:channel_id. Echoed's bot
  // upload endpoint accepts a single `file` field; we don't set Content-Type
  // ourselves so fetch picks the correct multipart boundary.
  async uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResponse> {
    const { serverId, channelId, bytes, filename, contentType } = input;
    const url = `${this.baseUrl}/v1/bots/${serverId}/upload/${channelId}`;
    const form = new FormData();
    form.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: contentType }), filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Bot-Token': this.token,
        'User-Agent': 'zorium-meme-bot/1.0',
      },
      body: form,
    });

    let parsed: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.error === 'string' && obj.error) ||
        `HTTP ${res.status}`;
      const code = typeof obj.code === 'number' ? obj.code : undefined;
      log.warn({ path: '/upload', status: res.status, message }, 'Echoed upload error');
      throw new EchoedApiError(res.status, code, message);
    }

    const body = (parsed ?? {}) as Partial<UploadAttachmentResponse>;
    if (!body.fileId) {
      throw new EchoedApiError(500, undefined, 'Upload succeeded but response missing fileId');
    }
    return body as UploadAttachmentResponse;
  }
}
