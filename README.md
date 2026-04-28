# Zorium Meme Bot

Realtime meme bot for [Echoed](https://echoed.gg). Listens on Socket.IO for `!meme` commands, fetches fresh top posts from Reddit (via [meme-api.com](https://meme-api.com)), and posts them in-channel — with caching, NSFW filtering, per-channel cooldowns, and graceful reconnect.

## Commands

| Command | Description |
| --- | --- |
| `!meme` | Random meme from the default rotation |
| `!meme <subreddit>` | From a specific allowed subreddit |
| `!memes <n>` | Send up to 5 memes at once (`!memes 3 dankmemes`) |
| `!makememe <template> <top> \| <bottom>` | Generate a captioned meme via memegen.link. Pass `random` as the template to roll one |
| `!memetemplates` | List the curated short-list of popular templates |
| `!memesearch <name>` | Search the full memegen catalog (~200 templates) |
| `!memesubs` | List allowed subreddits |
| `!memehelp` | Print the command list |
| `!memeping` | Health check + uptime |

## How it works

```
Echoed Socket.IO ──┐
                   │ messageEvent: message:created
                   ▼
              dispatch (parses !prefix, applies cooldown)
                   │
                   ├── handleMeme   ─▶ CachedMemeProvider ─▶ MemeApiProvider ─▶ meme-api.com
                   ├── handleMemes  ─┘                      (D3vd/Meme_Api)
                   ├── handleSubs   ─┐
                   ├── handleHelp   ─┤── EchoedClient (REST X-Bot-Token) ─▶ Echoed API
                   └── handlePing   ─┘
```

- **Real-time**, no polling. Bot connects once, authenticates with `BOT_TOKEN`, and is auto-joined to every server room it's invited to.
- **In-memory pool per subreddit**, ~50 memes deep, 1-hour TTL by default. Refills lazily on miss and refreshes in the background when running low.
- **Per-channel "last 20 seen"** prevents the same meme appearing twice in a row.
- **NSFW off by default** — flagged posts are filtered. Toggle with `NSFW_ALLOWED=true`.
- **Per-channel cooldown** (default 2s) keeps the bot under Echoed's 20-req/min budget.

## Setup

```bash
npm install
cp .env.example .env       # then set BOT_TOKEN
npm run dev                # watch mode via tsx
# or
npm run build && npm start # production build
```

Get a bot token by creating a bot on Echoed, then invite it to a server.

## Configuration

All env vars (see `.env.example` for full list and defaults):

| Var | Default | Purpose |
| --- | --- | --- |
| `BOT_TOKEN` | (required) | Bot key starting with `zbot_` |
| `ECHOED_API_URL` | `https://go.echoed.gg` | REST base URL |
| `ECHOED_SOCKET_URL` | `https://socket.echoed.gg` | Socket.IO base URL |
| `COMMAND_PREFIX` | `!` | What triggers commands |
| `NSFW_ALLOWED` | `false` | Allow NSFW-flagged memes |
| `DEFAULT_SUBREDDITS` | `memes,dankmemes,wholesomememes,me_irl` | Random rotation pool |
| `ALLOWED_SUBREDDITS` | (curated) | Subreddits users can request explicitly |
| `CACHE_TTL_MINUTES` | `60` | Pool freshness window |
| `CACHE_REFRESH_AT` | `10` | Trigger background refill at this remaining count |
| `PER_CHANNEL_COOLDOWN_MS` | `2000` | Soft per-channel rate limit |
| `SEEN_TRACKER_SIZE` | `20` | "Recently shown" memory per channel |

## Deploy with Nixpacks

A pinned `nixpacks.toml` and a `Procfile` are included. Point Railway, Render, Coolify, Northflank, or any other Nixpacks-compatible platform at this repository, set `BOT_TOKEN` in the environment, and the start command resolves to `node dist/index.js`.

```toml
# nixpacks.toml
[phases.setup]
nixPkgs = ['nodejs_20']

[phases.install]
cmds = ['npm ci']

[phases.build]
cmds = ['npm run build']

[start]
cmd = 'node dist/index.js'
```

## Echoed bot API reference

Integration points relevant to anyone building a bot on Echoed.

### Authentication

REST endpoints expect the bot key on the `X-Bot-Token` header:

```http
X-Bot-Token: zbot_xxxxxxxxxxxxxxxx
```

### Realtime transport

Echoed exposes a Socket.IO endpoint, not a raw WebSocket. After `connect`, the client emits an `authenticate` event with the bot token; the server replies with an `authenticated` event indicating success.

Once authenticated, the bot is joined automatically to a `server:<id>` room for every server it has been invited to. No explicit `subscribe` is required for those.

### Event envelope

All Socket.IO events arrive shaped as `{ type: 'resource:action', data: {...} }`. Message creates surface on `messageEvent` with `type: 'message:created'`.

### Commands

Echoed has no slash-command or interaction system. Bots receive plain-text messages and parse their own command syntax — this implementation uses the `!` prefix.

### Reactions

There are no REST endpoints for adding or removing reactions from a bot account. Reactions can only be observed via `reactionEvent` over Socket.IO.

### Rate limits

REST traffic is rate-limited to 20 requests per 60 seconds per bot identity, enforced server-side via a Redis sliding window. Exceeded calls return `429` with a `retryAfter` field. The per-channel cooldown configured in this bot is the first line of defense; staggered sends inside batch commands are the second.

## Project structure

```
src/
├── index.ts                  entry: validate token, wire services, connect
├── config.ts                 typed env loading + defaults
├── log.ts                    pino (pretty in dev, JSON in prod)
├── types.ts                  Meme, MessageCreatedData, CommandContext
├── client/
│   ├── echoedClient.ts       REST client (validate, profile, sendMessage)
│   └── echoedSocket.ts       Socket.IO connection + auth + heartbeat
├── meme/
│   ├── memeProvider.ts       interface
│   ├── memeApiProvider.ts    meme-api.com (D3vd/Meme_Api)
│   ├── cachedProvider.ts     per-subreddit pool, lazy refresh
│   └── seenTracker.ts        per-channel "last N" dedup
└── commands/
    ├── index.ts              registry + dispatcher + cooldown
    ├── meme.ts
    ├── memes.ts
    ├── help.ts
    ├── subs.ts
    └── ping.ts
```

## License

MIT
