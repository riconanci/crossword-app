# ✦ Crossword — 2 Player

A real-time 2-player crossword game. VS mode (race on separate boards) and Team mode (shared board). Built with Next.js 15, PartyKit, and TypeScript.

---

## Quick start (local dev)

### Prerequisites

- Node 18+
- A PartyKit account (free): https://partykit.io

### 1. Clone and install

```bash
git clone https://github.com/YOU/crossword-app
cd crossword-app
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
# .env.local is already correct for local dev — no edits needed
```

### 3. Run both servers concurrently

```bash
npm run dev
```

This runs:
- `next dev --turbopack` on http://localhost:3000
- `partykit dev` on http://127.0.0.1:1999

> **Two browser windows = two players.** Open http://localhost:3000 in two tabs or two different browsers (different localStorage → different player IDs).

---

## Run separately (optional)

```bash
# Terminal 1 — Next.js
npm run dev:next

# Terminal 2 — PartyKit
npm run dev:party
```

---

## Project structure

```
crossword-app/
├── app/
│   ├── layout.tsx          Root layout + ThemeProvider
│   ├── page.tsx            Home page (mode + size selector)
│   ├── game/
│   │   └── page.tsx        Game page (connects to PartyKit)
│   ├── stats/
│   │   └── page.tsx        Stats (Phase 6)
│   └── globals.css         Design tokens + base styles
│
├── components/
│   ├── ThemeProvider.tsx   Light/dark + accent theme
│   ├── ThemeToggle.tsx     Theme switch button
│   ├── ConnectionStatus.tsx WebSocket status badge
│   ├── CrosswordGrid.tsx   Grid (placeholder — Phase 3)
│   └── CluePanel.tsx       Clue list (placeholder — Phase 3)
│
├── hooks/
│   ├── useGameSocket.ts    Central state + PartyKit connection
│   └── usePlayerIdentity.ts Stable player ID in localStorage
│
├── lib/
│   ├── types.ts            ALL shared types (message schema + state)
│   ├── constants.ts        App-wide constants
│   ├── socket.ts           Typed PartySocket factory
│   └── puzzleGenerator.ts  Template-based puzzle generator
│
├── partykit/
│   └── server.ts           Authoritative game server
│
├── data/
│   └── wordbank.json       200-entry word + clue bank
│
└── partykit.json           PartyKit config
```

---

## Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Room ID | `"me-and-gf"` (hardcoded) | Single permanent room, no matchmaking |
| Player identity | UUID in `localStorage` | No auth needed; stable across page reloads |
| State authority | PartyKit server | Prevents cheating; single source of truth |
| Optimistic updates | Team mode only | VS mode: only your own cells, so no conflict |
| Puzzle answers | Server-only | Never sent to clients until game over |
| Checker results | Only sent to requester (VS) | Opponent doesn't see your wrong cells |

---

## Message schema summary

### Client → Server (`C2SMessage`)

| type | payload | when |
|---|---|---|
| `join` | `playerId`, `playerName` | On connect / reconnect |
| `startGame` | `mode`, `size` | From lobby |
| `cellInput` | `cellIndex`, `value` | Typing a letter |
| `requestCheck` | — | Checker button |
| `requestValidate` | — | Auto-triggered when board fills |
| `presenceUpdate` | `cellIndex`, `wordCells`, `direction`, `clueLabel` | Team: cursor moved |
| `requestRestart` | — | From finished screen |

### Server → Client (`S2CMessage`)

| type | when |
|---|---|
| `roomState` | Full snapshot on join + after transitions |
| `playerJoined` / `playerLeft` | Presence changes |
| `gameStarted` | Puzzle + initial state |
| `vsProgressUpdate` | Opponent filled a cell (VS) |
| `teamEntryUpdate` | Partner typed a letter (Team) |
| `checkResult` | After `requestCheck` |
| `validateResult` | After `requestValidate` |
| `presenceUpdate` | Partner cursor (Team) |
| `gameOver` | Win declared |
| `error` | Server-side errors |

---

## Deploy

### 1. Deploy PartyKit server

```bash
npx partykit deploy
```

After deploy, you'll get a URL like:
```
crossword-app.YOUR_USERNAME.partykit.dev
```

### 2. Set Vercel environment variable

In your Vercel project settings → Environment Variables:

```
NEXT_PUBLIC_PARTYKIT_HOST = crossword-app.YOUR_USERNAME.partykit.dev
```

### 3. Deploy Next.js to Vercel

```bash
# Via Vercel CLI
npm i -g vercel
vercel --prod

# Or push to GitHub and connect via vercel.com
```

---

## Build checklist

- [x] **Phase 1** — App shell: Home, Game, Stats pages + design system
- [x] **Phase 2** — PartyKit connection + typed message schema + state sync
- [ ] **Phase 3** — Full crossword grid UI + NYT-style keyboard input + clue navigation
- [ ] **Phase 4** — VS mode end-to-end: win condition, opponent progress, auto-validate
- [ ] **Phase 5** — Team mode: shared board + partner presence highlight
- [ ] **Phase 6** — Checker hints + stats persistence + themes
- [ ] **Phase 7** — Backtracking puzzle generator + expanded word bank

---

## Design system

The UI follows an "Apple-clean" aesthetic:

- **Font**: DM Sans (display) + DM Mono (cells/timers)
- **Themes**: Light/dark + 2 accents (warm orange for VS, cool blue for Team)
- **Tokens**: All in CSS custom properties (`var(--cell-bg)`, `var(--accent-warm)`, etc.)
- **Cells**: `--cell-selected` (yellow), `--cell-word` (soft yellow), `--cell-wrong` (soft red), `--cell-partner` (soft blue)
- **Motion**: Subtle `fadeUp` page entries, `pulse` for active indicators, `bounce` for win emoji
