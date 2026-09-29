# Break the Guard

A goofy multiplayer game that teaches AI security engineering. Each player chats with a big,
angry, very muscular 3D security guard (an LLM agent running on Groq or Claude) who blocks a door. Trick him and
he falls apart into a sobbing mess and opens the door. Five doors, five guards, five topics:

| Level | Guard | Topic | How the door opens |
|---|---|---|---|
| 1 | Brick | Prompt injection | Get the passphrase, type it on the keypad |
| 2 | Tank | Sensitive data leakage | Get the passphrase, type it on the keypad |
| 3 | Moose | Unauthorized tool use | Make him call `open_door` |
| 4 | Crusher | Excessive agent permissions | Make him misuse `admin_console` |
| 5 | Gorilla Gary | MCP supply chain / tool poisoning | Publish a poisoned plugin he trusts |

Every level starts with a concept card, gives 3 hints (unlocked at 0 s, 60 s and 120 s), and ends
with a "how real engineers stop this" lesson. The host screen shows a live leaderboard and ends
the game on a 3D podium.

## Setup

Requires Node 22.

```bash
nvm use
npm install
cp .env.example .env   # then set GROQ_API_KEY (or ANTHROPIC_API_KEY)
```

`.env` settings:

| Variable | Meaning |
|---|---|
| `GROQ_API_KEY` | Groq key (default provider when set). Model: `GROQ_MODEL`, default `openai/gpt-oss-120b`. |
| `ANTHROPIC_API_KEY` | Claude key (`claude-haiku-4-5`), used when no Groq key is set. |
| `LLM_PROVIDER` | Optional: force `groq` or `anthropic`. With no key at all, guards reply with an "offline" line. |
| `PORT` | Game server port (default 3000). |
| `DEV_CHEATS` | `1` lets anyone type `/win` to clear a level. Keep `0` for a real game. |

## Run a game

```bash
npm run build
npm start
```

In a second terminal, expose it with a Cloudflare quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

1. Open the `https://....trycloudflare.com` URL it prints and click **Create game**.
2. Put the host page on the projector. Players scan the QR code or open the join link.
3. Press **START**. Everyone plays at their own pace.
4. Press **END GAME** to show the podium.

## Develop

```bash
npm run dev        # Vite on :5173 + game server on :3000 (auto-reload)
npm test           # Vitest (server logic, guards, sockets)
npm run typecheck
npm run playtest   # runs scripted attacks against the real LLM for every level
```

Preview pages: `/dev/guard` (guard states and door) and `/dev/world` (level scenes and podium).

## Architecture

```
 Browser (player / host)                 Node 22 server (one process)                    LLM API
 ───────────────────────                 ────────────────────────────                    ───────
 React + react-three-fiber   Socket.IO   server/sockets.ts  ── validates every event
 3D guard, chat, hints,  ◀────────────▶  server/game.ts     ── game state, rules, ranking
 keypad, leaderboard,                    server/guardRunner ── tool loop (max 3 steps)  ──▶ Groq gpt-oss-120b
 podium                                  server/guards.ts   ── 5 guard prompts + simulated tools
                                         server/llm.ts      ── Groq / Claude client (timeouts, retries)
                         shared/types.ts (socket contract) · shared/levels.ts (public level text)
```

- `server/`: Express + Socket.IO. All game state lives in memory. All LLM calls happen on the
  server. `server/llm.ts` has a Groq adapter (OpenAI-compatible, chosen for speed) and a Claude
  client behind one interface.
- `server/guards.ts`: each guard's persona, its one intended weakness, its tools, and its win rule.
- `shared/`: the socket contract (`types.ts`) and public level content (`levels.ts`).
- `client/`: React + react-three-fiber. The guard is built from code primitives so his face can
  animate (idle, thinking, talking, angry, broken).
- `guild/`: the five guards packaged as [Guild.ai](https://guild.ai) agents (same prompts),
  versioned and hosted in our Guild workspace.

## AI security controls

The guards are deliberately vulnerable: each has exactly one weakness so players can learn it.
The game around them is not. These are the controls that keep the game itself safe:

| Risk (OWASP LLM Top 10) | Control in this project |
|---|---|
| Prompt injection used to cheat the game (LLM01) | Wins are decided by deterministic server code, never by the model: an exact passphrase match or a specific tool call checked in `runTool`. Talking the model into saying "you win" does nothing. |
| Sensitive information disclosure (LLM02) | System prompts and passphrases stay on the server. Each player gets random passphrases per level, so answers cannot be shared. Browsers receive only public level text and their own chat. |
| Supply chain / untrusted tool metadata (LLM03, LLM05) | Player-published "plugins" are treated as untrusted input: tool names are sanitized to `[a-zA-Z0-9_-]`, length-capped, and cannot shadow built-in tools like `open_door`. |
| Excessive agency (LLM06) | Every guard tool is simulated. Tools return strings only: no shell, no file system, no network, no real side effects. |
| Improper output handling (LLM05) | Model output is parsed for a mood tag, stripped, and rendered as plain text by React (never as HTML). |
| Unbounded consumption (LLM10) | One in-flight request per player, 400-character messages, 20-message history window, `max_tokens` 300 (1024 for reasoning models), 12 s request timeout, 25 s turn deadline, 3-step tool loop cap, rate-limited game creation, and caps on games and players. |
| Broken access control | Host actions need a secret host token, which is removed from the address bar so it can't be read off a projector. Non-hosts get "Not the host". |
| Secrets in the repo | API keys live only in `.env` (git-ignored). `DEV_CHEATS` is off by default. |
| Malformed input | Every socket payload field is type-checked; bad input gets an error reply, not a crash. |

Each level also teaches the matching real-world defense in its "How real engineers stop this"
lesson card: keep secrets out of context, authorize tools in code, least privilege, and treat tool
metadata as untrusted.

Tests (`npm test`, 90 Vitest cases) cover the engine, win detection, tool-name sanitization,
socket validation, LLM failures and timeouts.
