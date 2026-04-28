import { log } from '../log.js';
import type { EchoedClient } from '../client/echoedClient.js';

// 50 MB matches Echoed's bot upload ceiling (config/config.go MaxFileSizeMB).
// Anything bigger gets dropped before we even try to upload.
const MAX_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

interface DeliverImageInput {
  api: EchoedClient;
  serverId: string;
  channelId: string;
  imageUrl: string;
  caption: string;
  fallbackFilenameBase: string;
  replyToId?: string;
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function deriveFilename(rawUrl: string, fallbackBase: string): { filename: string; contentType: string } {
  let pathname = '';
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    // Malformed URL — caller likely already validated, but fall through gracefully.
  }
  const base = pathname.split('/').pop()?.split('?')[0] ?? '';
  const dot = base.lastIndexOf('.');
  if (dot > 0 && dot < base.length - 1) {
    const ext = base.slice(dot + 1).toLowerCase();
    const contentType = EXT_TO_CONTENT_TYPE[ext] ?? 'application/octet-stream';
    return { filename: base, contentType };
  }
  return { filename: `${fallbackBase}.png`, contentType: 'image/png' };
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'zorium-meme-bot/1.0' },
    });
    if (!res.ok) {
      throw new Error(`source returned ${res.status}`);
    }
    const headerType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new Error(`image too large (${buf.byteLength} bytes)`);
    }
    return { bytes: new Uint8Array(buf), contentType: headerType };
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort attachment delivery. Tries to download the image and post it as
// an attachment; on any failure, falls back to URL-in-content so the user
// still gets *something* in the channel rather than a silent error.
export async function deliverImage(input: DeliverImageInput): Promise<void> {
  const { api, serverId, channelId, imageUrl, caption, fallbackFilenameBase, replyToId } = input;

  const { filename: derivedName, contentType: derivedType } = deriveFilename(imageUrl, fallbackFilenameBase);

  try {
    const { bytes, contentType: fetchedType } = await fetchImageBytes(imageUrl);
    // Header content-type wins over URL extension (some hosts serve `.jpg` as png).
    const contentType =
      fetchedType && fetchedType.startsWith('image/') ? fetchedType : derivedType;

    const upload = await api.uploadAttachment({
      serverId,
      channelId,
      bytes,
      filename: derivedName,
      contentType,
    });

    await api.sendMessage({
      serverId,
      channelId,
      content: caption,
      attachmentIds: [upload.fileId],
      ...(replyToId ? { replyToId } : {}),
    });
    return;
  } catch (err) {
    log.warn(
      { err, imageUrl, channelId },
      'Attachment delivery failed — falling back to URL',
    );
  }

  // Last-resort fallback: post URL in content so the user still sees something.
  // Echoed's async unfurl will (eventually) turn it into an inline embed.
  const fallbackContent = caption ? `${caption}\n${imageUrl}` : imageUrl;
  await api.sendMessage({
    serverId,
    channelId,
    content: fallbackContent,
    ...(replyToId ? { replyToId } : {}),
  });
}
