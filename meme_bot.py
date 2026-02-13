"""
Meme Bot for Echoed (Zorium)
Connects via Socket.IO, listens for !meme commands, generates memes via memegen.link
"""
import os
import re
import random
import time
import threading
import socketio
import requests
from dotenv import load_dotenv

load_dotenv()

BOT_API_KEY = os.getenv('BOT_API_KEY', '')
BASE_URL = os.getenv('BASE_URL', 'http://localhost:3001/v1/bots')
SOCKET_URL = os.getenv('SOCKET_URL', 'http://localhost:3000')

MEMEGEN_API = 'https://api.memegen.link'

# Populated at startup
bot_id = None
bot_name = None

# --- memegen.link helpers ---

_templates_cache = []
_templates_fetched_at = 0
CACHE_TTL = 300  # 5 minutes


def _encode_memegen_text(text: str) -> str:
    """Encode text for memegen.link URL paths per their spec."""
    text = text.strip()
    if not text:
        return '_'
    replacements = [
        ('-', '--'),
        ('_', '__'),
        (' ', '_'),
        ('?', '~q'),
        ('&', '~a'),
        ('%', '~p'),
        ('#', '~h'),
        ('/', '~s'),
        ('\\', '~b'),
        ('"', "''"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def fetch_templates() -> list:
    """Fetch and cache meme templates from memegen.link."""
    global _templates_cache, _templates_fetched_at
    now = time.time()
    if _templates_cache and (now - _templates_fetched_at) < CACHE_TTL:
        return _templates_cache
    try:
        resp = requests.get(f'{MEMEGEN_API}/templates', timeout=10)
        resp.raise_for_status()
        _templates_cache = resp.json()
        _templates_fetched_at = now
    except Exception as e:
        print(f'[MemeBot] Failed to fetch templates: {e}')
    return _templates_cache


def search_templates(query: str) -> list:
    """Search templates by name."""
    templates = fetch_templates()
    q = query.lower()
    return [t for t in templates if q in t.get('name', '').lower()]


def build_meme_url(template_id: str, top: str = '', bottom: str = '') -> str:
    """Build a memegen.link image URL."""
    top_enc = _encode_memegen_text(top) if top else '_'
    bottom_enc = _encode_memegen_text(bottom) if bottom else '_'
    return f'{MEMEGEN_API}/images/{template_id}/{top_enc}/{bottom_enc}.png'


# --- Popular templates shortlist ---

POPULAR_TEMPLATES = [
    ('drake', 'Drake Hotline Bling'),
    ('buzz', 'Buzz Lightyear'),
    ('doge', 'Doge'),
    ('fry', 'Futurama Fry'),
    ('batman', 'Batman Slapping Robin'),
    ('success', 'Success Kid'),
    ('grumpy', 'Grumpy Cat'),
    ('rollsafe', 'Roll Safe'),
    ('picard', 'Picard Facepalm'),
    ('alien', 'Ancient Aliens'),
    ('fine', 'This Is Fine'),
    ('change', 'Change My Mind'),
    ('brain', 'Expanding Brain'),
    ('distracted', 'Distracted Boyfriend'),
    ('always', 'Always Has Been'),
]

# --- API client ---

session = requests.Session()
session.headers.update({
    'X-Bot-Token': BOT_API_KEY,
    'Content-Type': 'application/json',
})


def api_get(endpoint: str, **kwargs):
    try:
        r = session.get(f'{BASE_URL}{endpoint}', timeout=10, **kwargs)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f'[MemeBot] API GET {endpoint} failed: {e}')
        return None


def api_post(endpoint: str, json_data: dict):
    try:
        r = session.post(f'{BASE_URL}{endpoint}', json=json_data, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f'[MemeBot] API POST {endpoint} failed: {e}')
        return None


def send_message(server_id: str, channel_id: str, content: str):
    return api_post(f'/{server_id}/messages/send', {
        'channelId': channel_id,
        'content': content,
    })


# --- Command handlers ---

def cmd_help(server_id: str, channel_id: str, _args: str):
    msg = (
        "**Meme Bot Commands**\n"
        "`!meme help` - Show this help message\n"
        "`!meme generate <template> <top> | <bottom>` - Generate a meme\n"
        "`!meme templates` - List popular meme templates\n"
        "`!meme search <query>` - Search templates by name\n"
        "`!meme random` - Random meme from template list\n"
        "`!meme random <top> | <bottom>` - Random template with custom text\n"
        "`!meme preview <template>` - Show blank template preview\n"
        "\nExample: `!meme generate drake \"using API keys\" | \"using free APIs\"`"
    )
    send_message(server_id, channel_id, msg)


def cmd_templates(server_id: str, channel_id: str, _args: str):
    lines = ["**Popular Meme Templates**\n"]
    for tid, tname in POPULAR_TEMPLATES:
        lines.append(f"`{tid}` - {tname}")
    lines.append(f"\nUse `!meme search <query>` to find more from {len(fetch_templates())}+ templates.")
    send_message(server_id, channel_id, '\n'.join(lines))


def cmd_search(server_id: str, channel_id: str, args: str):
    query = args.strip()
    if not query:
        send_message(server_id, channel_id, "Usage: `!meme search <query>`")
        return
    results = search_templates(query)
    if not results:
        send_message(server_id, channel_id, f"No templates found for **{query}**.")
        return
    lines = [f"**Templates matching \"{query}\"** (showing up to 15)\n"]
    for t in results[:15]:
        tid = t.get('id', '').split('/')[-1]
        lines.append(f"`{tid}` - {t.get('name', 'Unknown')}")
    send_message(server_id, channel_id, '\n'.join(lines))


def _parse_top_bottom(text: str):
    """Parse 'top text | bottom text' from arguments, handling optional quotes."""
    if '|' in text:
        parts = text.split('|', 1)
        top = parts[0].strip().strip('"').strip("'")
        bottom = parts[1].strip().strip('"').strip("'")
        return top, bottom
    # No pipe - treat entire text as top
    return text.strip().strip('"').strip("'"), ''


def cmd_generate(server_id: str, channel_id: str, args: str):
    args = args.strip()
    if not args:
        send_message(server_id, channel_id,
                     "Usage: `!meme generate <template> <top> | <bottom>`\n"
                     "Example: `!meme generate drake \"coding all night\" | \"sleeping\"`")
        return

    # Split: first word is template, rest is text
    parts = args.split(None, 1)
    template_id = parts[0].lower()
    text_part = parts[1] if len(parts) > 1 else ''

    top, bottom = _parse_top_bottom(text_part)
    url = build_meme_url(template_id, top, bottom)
    send_message(server_id, channel_id, url)


def cmd_random(server_id: str, channel_id: str, args: str):
    templates = fetch_templates()
    if not templates:
        send_message(server_id, channel_id, "Failed to fetch templates. Try again later.")
        return

    t = random.choice(templates)
    tid = t.get('id', '').split('/')[-1]

    args = args.strip()
    if args:
        top, bottom = _parse_top_bottom(args)
    else:
        # Use the template's example text if available
        example = t.get('example', {})
        top = example.get('text', ['', ''])[0] if example.get('text') else ''
        bottom = example.get('text', ['', ''])[1] if example.get('text') and len(example.get('text', [])) > 1 else ''

    url = build_meme_url(tid, top, bottom)
    send_message(server_id, channel_id, f"**{t.get('name', tid)}**\n{url}")


def cmd_preview(server_id: str, channel_id: str, args: str):
    template_id = args.strip().lower()
    if not template_id:
        send_message(server_id, channel_id, "Usage: `!meme preview <template>`")
        return
    url = build_meme_url(template_id, '_', '_')
    send_message(server_id, channel_id, url)


COMMANDS = {
    'help': cmd_help,
    'generate': cmd_generate,
    'templates': cmd_templates,
    'search': cmd_search,
    'random': cmd_random,
    'preview': cmd_preview,
}


def handle_command(server_id: str, channel_id: str, text: str):
    """Parse and dispatch a meme command."""
    text = text.strip()
    if not text:
        cmd_help(server_id, channel_id, '')
        return

    parts = text.split(None, 1)
    cmd_name = parts[0].lower()
    cmd_args = parts[1] if len(parts) > 1 else ''

    handler = COMMANDS.get(cmd_name)
    if handler:
        handler(server_id, channel_id, cmd_args)
    else:
        # Treat unknown subcommand as a template name for generate
        cmd_generate(server_id, channel_id, text)


# --- Socket.IO connection ---

sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    reconnection_delay=1,
    reconnection_delay_max=30,
)


@sio.event
def connect():
    print('[MemeBot] Connected to socket server')
    sio.emit('authenticate', {'botToken': BOT_API_KEY})


@sio.event
def disconnect():
    print('[MemeBot] Disconnected from socket server')


@sio.on('authenticated')
def on_authenticated(data):
    if data.get('success'):
        info = data.get('bot') or data.get('user', {})
        print(f'[MemeBot] Authenticated as {info.get("name", "?")} ({info.get("id", "?")})')
        # Subscribe to all servers and channels
        subscribe_all()
    else:
        print(f'[MemeBot] Auth failed: {data.get("message")}')


@sio.on('error')
def on_error(data):
    print(f'[MemeBot] Socket error: {data}')


@sio.on('messageEvent')
def on_message_event(data):
    """Handle incoming message events."""
    event_type = data.get('type', '')
    if event_type not in ('new_message', 'message_created', ''):
        return  # Only handle new messages

    msg = data.get('data', data)
    content = msg.get('content', '')
    sender_id = msg.get('senderId', '')
    channel_id = msg.get('channelId', '')
    server_id = msg.get('serverId', '')

    # Ignore own messages
    if sender_id == bot_id:
        return

    # Skip DMs for now
    if msg.get('isDirect'):
        return

    # Check for !meme prefix
    if content.startswith('!meme'):
        cmd_text = content[5:].strip()  # strip "!meme"
        handle_command(server_id, channel_id, cmd_text)
        return

    # Check for @mention (bot_id in content or mentions array)
    mentions = msg.get('mentions', [])
    mentioned = bot_id and (bot_id in mentions or f'@{bot_name}' in content or f'<@{bot_id}>' in content)
    if mentioned:
        # Strip the mention and treat the rest as a command
        cleaned = content
        cleaned = re.sub(rf'<@{re.escape(bot_id)}>', '', cleaned) if bot_id else cleaned
        cleaned = re.sub(rf'@{re.escape(bot_name)}', '', cleaned, flags=re.IGNORECASE) if bot_name else cleaned
        cleaned = cleaned.strip()
        handle_command(server_id, channel_id, cleaned)


def subscribe_all():
    """Subscribe to all servers and their channels."""
    servers_data = api_get('/servers')
    if not servers_data:
        print('[MemeBot] No servers found')
        return

    servers = servers_data.get('servers', [])
    print(f'[MemeBot] Bot has access to {len(servers)} server(s)')

    for srv in servers:
        srv_id = srv.get('serverId') or srv.get('id')
        srv_name = srv.get('serverName') or srv.get('name', 'unnamed')

        # Subscribe to server
        sio.emit('subscribe', {
            'botToken': BOT_API_KEY,
            'type': 'server',
            'id': srv_id,
        })
        print(f'[MemeBot]   Subscribed to server: {srv_name} ({srv_id})')

        # Subscribe to each channel
        ch_data = api_get(f'/{srv_id}/channels')
        if ch_data:
            channels = ch_data.get('channels', [])
            for ch in channels:
                ch_id = ch.get('id', '')
                ch_name = ch.get('name', 'unnamed')
                if ch.get('type') in ('text', ''):
                    sio.emit('subscribe', {
                        'botToken': BOT_API_KEY,
                        'type': 'channel',
                        'id': ch_id,
                    })
                    print(f'[MemeBot]     Subscribed to channel: {ch_name} ({ch_id})')


def main():
    global bot_id, bot_name

    if not BOT_API_KEY:
        print('[MemeBot] ERROR: BOT_API_KEY not set. Copy .env.example to .env and set your key.')
        return

    print('[MemeBot] Validating token...')
    result = api_get('/validate')
    if not result or not result.get('valid'):
        print('[MemeBot] ERROR: Invalid bot token.')
        return

    bot_id = result.get('bot_id')
    print(f'[MemeBot] Token valid. Bot ID: {bot_id}')

    # Get bot name from profile
    profile = api_get('/profile')
    if profile:
        bot_name = profile.get('name', 'MemeBot')
        print(f'[MemeBot] Bot name: {bot_name}')

    # Pre-fetch templates
    templates = fetch_templates()
    print(f'[MemeBot] Loaded {len(templates)} meme templates')

    # Connect socket
    print(f'[MemeBot] Connecting to {SOCKET_URL}...')
    try:
        sio.connect(SOCKET_URL, transports=['websocket'])
        sio.wait()
    except KeyboardInterrupt:
        print('\n[MemeBot] Shutting down...')
        sio.disconnect()
    except Exception as e:
        print(f'[MemeBot] Connection error: {e}')


if __name__ == '__main__':
    main()
