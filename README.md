# ✦ Crossword — Rico & Alyssa

A private 2-player real-time crossword game. VS mode (race on separate boards) and Team mode (shared board). Built with Next.js 15, PartyKit, and TypeScript.

---

## Players

On first visit each device shows two buttons — **Rico** and **Alyssa**. Tap once, remembered forever via `localStorage`. Change any time from the home screen.

---

## Features

**Game modes:** VS (separate boards, first correct wins) · Team (shared board, solve together)

**Board sizes:** 5×5 Quick · 7×7 Medium (default) · 11×11 Hard — selectable on home screen and in the lobby between games

**Input:** NYT-style. Click/tap cell → type. Tap same cell → toggle Across/Down. Backspace moves back. Arrows navigate. Tab / ‹ › cycle clues — all Across first, then all Down. Auto-selects 1-Across on game start.

**Checker:** 2 checks per game. Wrong cells → red. Click red cell to dismiss. Correct cells → green + locked (based on snapshot at check time, not live entries).

**Give Up:** Reveals full solved board, stays interactive so you can read the solution.

**Rematch:** Instant rematch button on every finish screen (same mode + size). "Change game" goes back to lobby.

**Confetti + sounds + haptics:** Win triggers confetti burst + fanfare. Keypress/word-complete/wrong/delete all have sounds and vibration. Toggle in Stats → Settings tab.

**Puzzle history:** Server tracks last 20 puzzles per size, avoids repeats.

**Stats:** VS tab with head-to-head sliding bar · Team tab with coop win bar · Best times per size · Forfeits · Settings tab (sounds/haptics toggles) · Reset button with confirmation.

---

## Local development

```bash
npm install
cp .env.local.example .env.local
npm run dev          # Next.js + PartyKit together (WSL/Mac/Linux)
npm run dev:next     # Next.js only — auto falls back to Demo mode after 3s
```

Open in two different browser profiles (different localStorage = different players).

---

## Deploy

### 1. Deploy PartyKit server
```bash
npx partykit login
npx partykit deploy
# → prints: crossword-app.YOUR_USERNAME.partykit.dev
```

### 2. Set environment variable in Vercel
In your Vercel project → Settings → Environment Variables:
```
NEXT_PUBLIC_PARTYKIT_HOST = crossword-app.YOUR_USERNAME.partykit.dev
```

### 3. Deploy frontend to Vercel
```bash
npm i -g vercel
vercel --prod
# or connect GitHub repo on vercel.com for auto-deploy on push
```

That's it. Both phones open the Vercel URL → real multiplayer, no Demo mode.

---

## Project structure

```
crossword-app/
├── app/
│   ├── page.tsx              Home — Rico/Alyssa picker + mode/size selector
│   ├── game/page.tsx         Game — lobby, playing, finished
│   ├── stats/page.tsx        Stats — VS/Team/Settings tabs
│   └── globals.css           Design tokens
│
├── components/
│   ├── CrosswordGrid.tsx     Grid (letters, numbers, cell states)
│   ├── CluePanel.tsx         Clue list + prev/next nav
│   ├── Confetti.tsx          Win confetti burst
│   ├── ThemeProvider.tsx     Light/dark theme
│   ├── ThemeToggle.tsx       Theme switch
│   └── ConnectionStatus.tsx  WebSocket status badge
│
├── hooks/
│   ├── useGameSocket.ts      PartyKit connection + state + stat recording
│   ├── useGridInput.ts       Keyboard input, navigation, lock guards
│   └── usePlayerIdentity.ts  Stable UUID + name in localStorage
│
├── lib/
│   ├── types.ts              All shared types
│   ├── stats.ts              Pair stats (both players, per-mode, per-size, best times)
│   ├── sounds.ts             Web Audio API synthesized sound effects
│   ├── haptics.ts            navigator.vibrate haptic patterns
│   ├── puzzleGenerator.ts    Backtracking generator + 3 templates per size
│   ├── puzzleHistory.ts      Track played puzzles to avoid repeats
│   ├── demoMode.ts           Local simulation when PartyKit unreachable
│   ├── constants.ts          CHECKS_PER_GAME, BOARD_SIZES, PARTYKIT_HOST etc.
│   └── socket.ts             Typed PartySocket factory
│
├── partykit/
│   └── server.ts             Authoritative server (puzzle, entries, validation, history)
│
├── data/
│   ├── wordbank.json         Word + clue bank (~10,400 entries, 3–7 letters)
│   └── build-wordbank.mjs    CSV → wordbank.json (drop nyt-clues.csv and run)
│
├── .env.local.example        Copy to .env.local for local dev
└── partykit.json             PartyKit config (room: "me-and-gf")
```

---

## Architecture notes

| Decision | Choice | Why |
|---|---|---|
| Room ID | `"me-and-gf"` hardcoded | Single permanent room, no matchmaking |
| Player identity | UUID + name in `localStorage` | No auth needed, device remembers forever |
| State authority | PartyKit server | Single source of truth, puzzle answers never sent to clients |
| Correct cell locking | Snapshot at check time | New letters typed after check don't get wrongly locked |
| Stats storage | One shared key for both players | Either device shows full picture |
| Puzzle history | Server-side fingerprint tracking | Avoids repeat puzzles across games |
| Demo mode | Auto after 3s if PartyKit unreachable | Works on Windows without WSL |
| Sounds/haptics | Web Audio API + navigator.vibrate | No dependencies, zero file size |
