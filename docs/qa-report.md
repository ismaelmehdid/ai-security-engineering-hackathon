# QA Report: Break the Guard (Task 16)

Date: 2026-09-29. Tester: `qa`. Setup: shared dev server (Vite on 5173, API on 3000), `DEV_CHEATS=1`,
no Anthropic key (guards answer with the "offline" line, as expected).

## 1. Build checks

| Check | Result |
|---|---|
| `npm test` | PASS: 6 files, 56 tests (62 after the fixes added regression tests) |
| `npm run typecheck` | PASS: exit 0 |
| `npm run build` | PASS: exit 0. One warning: the JS chunk is 1.43 MB (405 kB gzip). Fine for a demo. |

## 2. Review Focus

| # | Item | Test coverage | Code | Result |
|---|---|---|---|---|
| 1 | Claude failure or timeout mid-message | `game.test` "clears busy and answers with fallback when the LLM throws"; `guardRunner.test` "returns the fallback line when the API throws" | `runGuardTurn` catches every error. `sendMessage` clears `busy` in `finally`. server-dev later added a socket-level test (fallback reply, busy cleared, next message accepted). | PASS |
| 2 | Odd model output (no mood tag, empty text, text only in a tool turn, `refusal`) | `guardRunner.test`: parseMood default, stray tags, refusal/empty gives fallback, 3-step tool loop gives fallback | Text accumulates across tool steps. A scratch probe confirmed: text in a tool turn followed by an empty final turn gives "Checking badge." (angry). | PASS |
| 3 | Level 5 plugin names (spaces, emoji, empty, `open_door`) | `guards.test`: 9 edge names give valid unique tool names; `open_door` becomes `plugin_open_door` and never wins; blank description gets a fallback | `sanitizeToolName` plus reserved-name prefix | PASS |
| 4 | Join edge cases (blank, 21+ chars, duplicate, after end, rejoin with token) | `game.test` join suite; `sockets.test` rejoin | Also checked in the browser: blank name is blocked, name input stops at 20, " alice " shows "That name is taken", a join after end shows "This game is over", reload restores progress | PASS |
| 5 | Wrong-state actions | `game.test`: message before start, after end, after finishing; keypad on a tool level; plugin off level 5; lowercase/spaced guesses. `passphrase.test`: dashed and punctuated guesses | Also: passphrase or plugin before start or after end is rejected ("The game isn't running"). server-dev later added tests for this. Live probe: plugin on level 1 gives "Plugins only work on the rooftop". | PASS |

Extra engine probes (scratch script, no repo changes):
- Correct passphrase while the guard is still thinking: the level clears, the late LLM reply is dropped, and `busy` goes back to false.
- Game ended while a winning tool call was in flight: no clear.

## 3. Security review (public demo)

| Question | Result |
|---|---|
| Can a player see another player's passphrase or any system prompt through a socket event or HTTP route? | NO. `PlayerState` holds only your own history. `HostState` and `podium` hold names, levels and ids, never tokens or passphrases. HTTP is only `POST /api/games` and `GET /api/games/:id` (`{exists}`). |
| Can a non-host start or end a game? | NO. Tested with raw sockets: no role, player role, and wrong or missing host token all return "Not the host" or "Wrong host token". |
| Real side effects in tools? | NO. `runTool` only returns strings; there is no `child_process`, `fs` or network use. The Claude client pins `baseURL` to api.anthropic.com. |
| XSS | React escapes everything. No `dangerouslySetInnerHTML`. 3D labels use troika text. |
| Host token exposure | Was ISSUE U1 (token visible in the projector's address bar). FIXED and re-verified. |
| Malformed payloads | Was ISSUE S1 (`{toString:1}` objects threw inside handlers). FIXED and re-verified. |
| `DEV_CHEATS` | Must be `0` for the public tunnel. `.env.example` already defaults to `0`. |
| Abuse and cost | No cap on games or players, so a scripted client could run up Claude spend (1 in-flight request per player). Acceptable for a hackathon demo. |

## 4. Browser smoke test

Tabs: host at `localhost:5173`. Players on separate origins: Alice at `localhost`, "Bob alice" at
`b.localhost`, Carol at `c.localhost` (late joiner), and Dave at `d.localhost` (idle). Two extra
players, "a,b" and "Zed", came from raw-socket probes.

| Step | Result |
|---|---|
| Home > Create game > host lobby with QR, link and copy button | PASS |
| 2 players join via the link; host lobby updates live; START disabled with 0 players | PASS |
| START: players see the concept card, host sees the leaderboard and feed | PASS |
| Chat message gets the offline reply in the chat and speech bubble | PASS |
| Wrong keypad guess: "BZZZT! Wrong passphrase.", guard angry (red face, steam), "WRONG!" bubble | PASS |
| `/win` on levels 1-5: guard broken line, door opens, camera goes through the doorway, lesson card, next level | PASS |
| Tool levels (3-5): no keypad button, and clicking the door opens nothing | PASS |
| Level 5: publish plugin named `open_door`; chat shows the install line and "installed" badge | PASS |
| Level 5 cleared, then Escape: "You escaped the building!" screen; host shows ESCAPED | PASS |
| Player B clears 1 level; host feed and leaderboard update live | PASS |
| Live reorder: late joiner Carol clears 2 levels and moves above Bob | PASS |
| Reload player B mid-level: level, chat history and hint timers restored, concept card skipped | PASS |
| END GAME: host podium shows Alice (gold, center), Carol (silver), Bob alice (bronze); the other 3 stand below with rain clouds; final ranking list correct | PASS (see note 1) |
| Final rank on each player: Alice #1, Carol #2, Bob alice #3, Dave #4 (of 6) | PASS |
| Host reload after end: podium restored | PASS |
| Player reload after end: rank restored, but no podium top-3 card | ISSUE S2, FIXED and re-verified |
| Unknown game id shows "Game not found"; wrong host token shows "NO ENTRY / Wrong host token"; lowercase game id in URL works | PASS |
| 390x844 player page: no horizontal scroll; concept card, keypad, lesson card and final screen fit | PASS |
| 390x844 chat usability | ISSUE U2, FIXED and re-verified |
| Console errors (host and all player tabs) | PASS: no errors. Only library warnings (`THREE.Clock` deprecated, `PCFSoftShadowMap` fallback) and troika font GPOS/GSUB logs. |

Note 1: the built-in browser suppresses `window.confirm` (it returns false), so END GAME needed
`window.confirm = () => true` in the QA tab. That is not a bug; real browsers show the dialog.

## 5. Bugs

| ID | Sev | Owner | File | Summary | Status |
|---|---|---|---|---|---|
| U1 | Medium | ui-dev | `client/src/pages/Host.tsx`, `client/src/hooks/useHostGame.ts` | The host token shows in the address bar (`/host/ID?token=...`) on the projector. Anyone who reads it can END or START the game. Fix: after host:join, move the token to localStorage and `history.replaceState` to `/host/ID`. | FIXED, re-verified |
| U2 | Low-Med | ui-dev | `client/src/styles.css` (mobile media block), `Play.tsx` | At 390x844 the chat input is below the fold (top at about 899px). After sending, the page stays scrolled about 415px, so the guard, door and camera exit play off-screen. | FIXED, re-verified |
| S1 | Low | server-dev | `server/sockets.ts` lines 28, 60, 62, 103, 117 | `String(obj)` throws for `{toString:1}` payloads: no ack, uncaught exception logged (no crash). Fix: `typeof v === 'string' ? v : ''`. | FIXED, re-verified |
| S2 | Low | server-dev | `server/sockets.ts` (`player:join`) | `game:ended` is not re-sent on rejoin, so the podium top 3 is missing after a reload once the game has ended. | FIXED, re-verified |

Info only (no action needed):
- Hint timers start when the level is cleared, while the lesson card is still up, not at "Face the guard".
- The host leaderboard's "time on door" uses the host browser clock against server timestamps. Fine when the host runs on the server laptop.
- If one socket joins twice as two different players (raw clients only), the first player never gets marked disconnected.
- In dev mode the 3D scenes take about 3-7 s to appear after a reload.

## 6. Fixes and re-verification

| ID | Fixed by | Re-verified |
|---|---|---|
| U1 | ui-dev: after `host:join`, the token moves to localStorage `btg:host:<ID>` and `history.replaceState` rewrites the URL to `/host/<ID>`. On load the page reads `?token=` first, then storage. | PASS. The address bar shows `/host/NY7AM` with no token. A reload of `/host/NY7AM` (no token in the URL) restores the lobby, and after the end it restores the podium. |
| U2 | ui-dev: on screens under 900px the page is exactly 100dvh with no page scroll. Canvas 40dvh; hints and plugin in a collapsible strip (max 22dvh); chat fills the rest with the input pinned; scroll to top on level cleared. | PASS at 390x844. Page height 844, canvas 0-338px, input at 750-800px, `scrollY` stays 0 after sending and after `/win`, and the guard's broken animation and the door stay visible. Desktop layout is unchanged. |
| S1 | server-dev: `str(v)` guard on every payload field in `sockets.ts`. `installPlugin` and `GameStore.get` check types. Regression tests added. | PASS. Live raw-socket probe: `{toString:1}` guess gets `{ok:true, correct:false}`; bad gameId (player and host join) gets "Game not found"; bad plugin name gets a normal error. No uncaught exceptions. |
| S2 | server-dev: `player:join` emits `game:ended {podium}` to the socket when the game is over. Test added. | PASS. A player reload after END shows "#2 of 2" plus the Podium card. A raw socket rejoin receives `game:ended`. |

server-dev also added regression tests for the optional gaps: LLM failure at the socket level, and
passphrase or plugin before start and after end.

Final gates after the fixes: `npm test` 62/62 PASS, `npm run typecheck` PASS, `npm run build` PASS.
Podium re-checked last (`PodiumScene.tsx` unchanged since 11:52): with 6 players it shows top 3 on
the steps and 3 sad players below with rain clouds; with 2 players the bronze step is empty. No
console errors.

## 7. Notes for the lead (Task 17)

- Set `DEV_CHEATS=0` for the tunnel demo.
- drei `<Text>` has no `font` prop, so troika fetches its default font from `cdn.jsdelivr.net` at
  runtime. The 3D canvases stay dark for about 3-7 s on a fresh load in dev, and longer on a slow
  venue network. Fix: ship a local font file and pass `font=` (this needs a download, so ask the user first).
- The only console errors seen were transient 502s from the Vite proxy while `tsx watch` restarted
  the API after teammates' edits. Each restart also wipes every in-memory game, so avoid editing
  server files during the demo.
- Worst-case guard "thinking" time is about 20 s x 2 attempts (maxRetries 1) x up to 3 tool steps.
