# Task Board — Break the Guard

Owned by `lead`. Teammates message `lead` when they start or finish a task; lead updates this board.
Plan: `docs/superpowers/plans/2026-09-29-break-the-guard.md`

| ID | Task | Owner | Status | Depends on |
|---|---|---|---|---|
| T0 | Scaffold, contract, stubs, dev server | lead | done | — |
| T1 | Passphrases + ranking | server-dev | done | T0 |
| T2 | Claude client + guard turn runner | server-dev | done | T1 |
| T3 | Game engine | server-dev | done | T2 |
| T4 | Sockets + real server | server-dev | done | T3 |
| T6 | Five guard configs | guard-writer | done | T0 |
| T7 | Content polish + playtest script (playtest blocked on API key) | guard-writer | blocked (API key; steps 1,2,4 done) | T2, T6 |
| T8 | Muscle guard (5 states) + /dev/guard | guard-3d | done | T0 |
| T9 | Door + keypad | guard-3d | done | T8 |
| T10 | Level scene, camera exit move, 5 decor sets + /dev/world | world-3d | done | T0 |
| T11 | Podium scene + PlayerAvatar | world-3d | done | T10 |
| T12 | CC0 asset upgrade (optional, needs user approval) | world-3d | skipped (user choice) | T11 |
| T13 | Socket client, Home page, visual style | ui-dev | done | T0 |
| T14 | Player experience | ui-dev | done | T13 (e2e check needs T4) |
| T15 | Host experience | ui-dev | done | T14 (e2e check needs T4) |
| T16 | Review + browser smoke test | qa | done | T4, T6, T8-T11, T13-T15 |
| T17 | Integration, real-key playtest, tunnel, README | lead | in-progress (README done; waiting on API key + demo go) | T16 |

Blockers:
- `.env` with `ANTHROPIC_API_KEY` not provided yet (blocks T7 step 3 only).
