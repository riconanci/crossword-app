// lib/puzzleGenerator.ts
// Constraint-based crossword filler with backtracking.
//
// KEY FIXES applied here:
//  1. buildCells() auto-converts orphan white cells to black.
//     An "orphan" is any white cell where both its across run AND down run are < 3.
//     These cells can never be part of a real word, causing "?" clues.
//  2. findSlots() enforces minimum length of 3 (words must be ≥ 3 letters).
//  3. Shuffle word lists ONCE per attempt, NEVER inside recursion.

import type { BoardSize, Cell, Clue, PuzzleWithAnswers, Direction } from "./types";
import WORD_BANK from "../data/wordbank.json";

// ─── Templates ───────────────────────────────────────────────────────────────
// 1 = white, 0 = black. 180° rotationally symmetric.
// Any remaining orphan cells are auto-converted to black by buildCells().

const TEMPLATES: Record<BoardSize, number[][][]> = {

  // ── 5×5 ─────────────────────────────────────────────────────────────────────
  5: [
    // A: hash — columns of 5 crossing a center row of 5
    [
      [1,0,1,0,1],
      [1,0,1,0,1],
      [1,1,1,1,1],
      [1,0,1,0,1],
      [1,0,1,0,1],
    ],
    // B: ladder — two full rows bridged by two full columns
    [
      [1,1,1,1,1],
      [0,1,0,1,0],
      [0,1,0,1,0],
      [0,1,0,1,0],
      [1,1,1,1,1],
    ],
    // C: diamond — center row + two corner runs
    [
      [0,1,1,1,0],
      [0,1,0,1,0],
      [1,1,1,1,1],
      [0,1,0,1,0],
      [0,1,1,1,0],
    ],
  ],

  // ── 7×7 ─────────────────────────────────────────────────────────────────────
  7: [
    // A: classic — two 7-letter rows + six 3-letter corner slots
    [
      [1,1,1,0,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,1,1,1,1],
      [0,0,1,0,1,0,0],
      [1,1,1,1,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,0,1,1,1],
    ],
    // B: open center — full outer columns + two 7-letter rows
    [
      [1,1,1,0,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1],
      [1,1,1,1,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,0,1,1,1],
    ],
    // C: shifted center — same outer frame, offset interior black
    [
      [1,1,1,0,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,1,1,1,1],
      [0,1,0,0,0,1,0],
      [1,1,1,1,1,1,1],
      [1,0,1,0,1,0,1],
      [1,1,1,0,1,1,1],
    ],
  ],

  // ── 11×11 ────────────────────────────────────────────────────────────────────
  // Orphan cells auto-fixed to black by buildCells().
  11: [
    // A: pinwheel — 5-across / 3-down cross-constraint design
    [
      [1,1,1,1,1,0,1,1,1,1,1],
      [1,0,0,1,1,1,1,1,0,0,1],
      [1,1,1,0,0,1,0,0,1,1,1],
      [1,0,1,1,1,0,1,1,1,0,1],
      [1,1,0,1,0,1,0,1,0,1,1],
      [0,1,1,0,1,0,1,0,1,1,0],
      [1,1,0,1,0,1,0,1,0,1,1],
      [1,0,1,1,1,0,1,1,1,0,1],
      [1,1,1,0,0,1,0,0,1,1,1],
      [1,0,0,1,1,1,1,1,0,0,1],
      [1,1,1,1,1,0,1,1,1,1,1],
    ],
    // B: snowflake — rotating 3-letter pattern
    [
      [1,1,1,0,1,1,1,0,1,1,1],
      [1,0,1,1,1,0,1,1,1,0,1],
      [1,1,0,1,0,1,0,1,0,1,1],
      [0,1,1,0,1,1,1,0,1,1,0],
      [1,1,0,1,1,0,1,1,0,1,1],
      [1,0,1,1,0,1,0,1,1,0,1],
      [1,1,0,1,1,0,1,1,0,1,1],
      [0,1,1,0,1,1,1,0,1,1,0],
      [1,1,0,1,0,1,0,1,0,1,1],
      [1,0,1,1,1,0,1,1,1,0,1],
      [1,1,1,0,1,1,1,0,1,1,1],
    ],
    // C: diamond grid — mixed 3/4/5-letter
    [
      [1,1,1,1,0,1,0,1,1,1,1],
      [1,0,0,1,1,1,1,1,0,0,1],
      [1,1,1,0,1,0,1,0,1,1,1],
      [1,0,1,1,0,1,0,1,1,0,1],
      [1,1,0,1,1,1,1,1,0,1,1],
      [0,1,1,0,1,0,1,0,1,1,0],
      [1,1,0,1,1,1,1,1,0,1,1],
      [1,0,1,1,0,1,0,1,1,0,1],
      [1,1,1,0,1,0,1,0,1,1,1],
      [1,0,0,1,1,1,1,1,0,0,1],
      [1,1,1,1,0,1,0,1,1,1,1],
    ],
  ],
};

// ─── Word bank setup ──────────────────────────────────────────────────────────

interface WordEntry { word: string; clue: string; }

const byLength: Record<number, WordEntry[]> = {};
for (const e of (WORD_BANK as WordEntry[])) {
  const l = e.word.length;
  if (!byLength[l]) byLength[l] = [];
  (byLength[l] as WordEntry[]).push(e);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tv(tmpl: number[][], r: number, c: number) { return tmpl[r]?.[c] ?? 0; }

/** Length of the contiguous white run containing cell (r,c) in the across direction. */
function acrossRunLen(tmpl: number[][], size: number, r: number, c: number): number {
  if (!tv(tmpl, r, c)) return 0;
  let start = c; while (start > 0 && tv(tmpl, r, start - 1)) start--;
  let len = 0; for (let cc = start; cc < size && tv(tmpl, r, cc); cc++) len++;
  return len;
}

/** Length of the contiguous white run containing cell (r,c) in the down direction. */
function downRunLen(tmpl: number[][], size: number, r: number, c: number): number {
  if (!tv(tmpl, r, c)) return 0;
  let start = r; while (start > 0 && tv(tmpl, start - 1, c)) start--;
  let len = 0; for (let rr = start; rr < size && tv(tmpl, rr, c); rr++) len++;
  return len;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generatePuzzle(size: BoardSize): PuzzleWithAnswers {
  const variants = TEMPLATES[size];
  const tmpl = variants[Math.floor(Math.random() * variants.length)]!;
  const cells = buildCells(size, tmpl);
  const slots = findSlots(cells, size, tmpl);

  // Up to 25 attempts; each pre-shuffles word lists once — never inside recursion
  let result: { filled: FilledSlot[]; answers: Record<number, string> } | null = null;
  for (let attempt = 0; attempt < 25 && !result; attempt++) {
    result = backtrack(slots);
  }
  if (!result) result = greedyFill(slots);

  // Sort: all Across clues (ascending number) then all Down clues (ascending number).
  // This ensures the prev/next navigation cycles Across first, then Down.
  const clues: Clue[] = result.filled
    .map((s) => ({
      number: s.number, direction: s.direction, text: s.clue,
      cells: s.cells, startCell: s.cells[0] ?? 0, length: s.cells.length,
    }))
    .sort((a, b) => {
      if (a.direction !== b.direction)
        return a.direction === "across" ? -1 : 1;
      return a.number - b.number;
    });

  return {
    id: `puzzle-${size}-${Date.now()}`,
    size, cells, clues, answers: result.answers, createdAt: Date.now(),
  };
}

// ─── Cell building ────────────────────────────────────────────────────────────

function buildCells(size: BoardSize, tmpl: number[][]): Cell[] {
  // ── Step 1: auto-fix orphan cells ──────────────────────────────────────────
  // A white cell is an "orphan" when BOTH its across run AND down run are < 3.
  // Such cells can never be filled via a real word entry (min word length = 3),
  // so they're converted to black to prevent broken progress/clue counts.
  const effective = tmpl.map((row) => [...row]);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!effective[r]![c]) continue;
      const aLen = acrossRunLen(effective, size, r, c);
      const dLen = downRunLen(effective, size, r, c);
      if (aLen < 3 && dLen < 3) effective[r]![c] = 0; // convert orphan → black
    }
  }

  // ── Step 2: build cell objects ─────────────────────────────────────────────
  const cells: Cell[] = [];
  let num = 1;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      const isBlack = effective[row]![col] === 0;
      let startNumber: number | null = null;

      if (!isBlack) {
        // Only number cells that start a run of ≥ 3
        const startsAcross =
          (col === 0 || !effective[row]![col - 1]) &&
          acrossRunLen(effective, size, row, col) >= 3;
        const startsDown =
          (row === 0 || !effective[row - 1]![col]) &&
          downRunLen(effective, size, row, col) >= 3;
        if (startsAcross || startsDown) startNumber = num++;
      }

      cells.push({ index, row, col, isBlack, acrossWord: null, downWord: null, startNumber });
    }
  }

  // ── Step 3: assign word memberships ───────────────────────────────────────
  const acStart: Record<number, number> = {};
  const dnStart: Record<number, number> = {};
  for (const cell of cells) {
    if (!cell.startNumber || cell.isBlack) continue;
    const { row, col } = cell;
    if ((col === 0 || !effective[row]![col - 1]) && acrossRunLen(effective, size, row, col) >= 3)
      acStart[cell.index] = cell.startNumber;
    if ((row === 0 || !effective[row - 1]![col]) && downRunLen(effective, size, row, col) >= 3)
      dnStart[cell.index] = cell.startNumber;
  }

  for (const cell of cells) {
    if (cell.isBlack) continue;
    const { row, col } = cell;
    let ac = col; while (ac > 0 && effective[row]![ac - 1]) ac--;
    const an = acStart[row * size + ac]; if (an !== undefined) cell.acrossWord = an;
    let dc = row; while (dc > 0 && effective[dc - 1]![col]) dc--;
    const dn = dnStart[dc * size + col]; if (dn !== undefined) cell.downWord = dn;
  }

  return cells;
}

// ─── Slot extraction ──────────────────────────────────────────────────────────

interface Slot { number: number; direction: Direction; cells: number[]; length: number; }
interface FilledSlot extends Slot { word: string; clue: string; }

function findSlots(cells: Cell[], size: number, tmpl: number[][]): Slot[] {
  // Rebuild effective template from cells (respects auto-fixed orphans)
  const effective: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (const cell of cells) {
    if (!cell.isBlack) effective[cell.row]![cell.col] = 1;
  }

  const slots: Slot[] = [];

  for (const cell of cells) {
    if (cell.isBlack || !cell.startNumber) continue;
    const { row, col, startNumber } = cell;

    // Across — minimum 3 letters
    if ((col === 0 || !effective[row]![col - 1]) && acrossRunLen(effective, size, row, col) >= 3) {
      const cs: number[] = [];
      for (let c = col; c < size && effective[row]![c]; c++) cs.push(row * size + c);
      if (cs.length >= 3) slots.push({ number: startNumber, direction: "across", cells: cs, length: cs.length });
    }

    // Down — minimum 3 letters
    if ((row === 0 || !effective[row - 1]![col]) && downRunLen(effective, size, row, col) >= 3) {
      const cs: number[] = [];
      for (let r = row; r < size && effective[r]![col]; r++) cs.push(r * size + col);
      if (cs.length >= 3) slots.push({ number: startNumber, direction: "down", cells: cs, length: cs.length });
    }
  }

  return slots.sort((a, b) => b.length - a.length || a.number - b.number);
}

// ─── Backtracking filler ──────────────────────────────────────────────────────

function backtrack(slots: Slot[]): { filled: FilledSlot[]; answers: Record<number, string> } | null {
  const answers: Record<number, string> = {};
  const used = new Set<string>();
  const filled: FilledSlot[] = new Array(slots.length);

  // Shuffle each word list ONCE per attempt — never inside recursion
  const shuffled: Record<number, WordEntry[]> = {};
  for (const len of new Set(slots.map((s) => s.length))) {
    shuffled[len] = shuffle(byLength[len] ?? []);
  }

  let nodes = 0;

  function solve(i: number): boolean | null {
    if (i === slots.length) return true;
    const slot = slots[i]!;
    const pool = shuffled[slot.length] ?? [];

    for (const entry of pool) {
      if (++nodes > 500_000) return null;
      if (used.has(entry.word)) continue;

      let ok = true;
      for (let k = 0; k < slot.cells.length; k++) {
        const existing = answers[slot.cells[k]!];
        if (existing !== undefined && existing !== entry.word[k]) { ok = false; break; }
      }
      if (!ok) continue;

      const placed: number[] = [];
      for (let k = 0; k < slot.cells.length; k++) {
        const ci = slot.cells[k]!;
        if (answers[ci] === undefined) { answers[ci] = entry.word[k]!; placed.push(ci); }
      }
      used.add(entry.word);
      filled[i] = { ...slot, word: entry.word, clue: entry.clue };

      const r = solve(i + 1);
      if (r === true) return true;
      used.delete(entry.word);
      for (const ci of placed) delete answers[ci];
      if (r === null) return null;
    }

    return false;
  }

  return solve(0) === true ? { filled: filled as FilledSlot[], answers } : null;
}

// ─── Greedy fallback ──────────────────────────────────────────────────────────

function greedyFill(slots: Slot[]): { filled: FilledSlot[]; answers: Record<number, string> } {
  const answers: Record<number, string> = {};
  const used = new Set<string>();

  const filled: FilledSlot[] = slots.map((slot) => {
    const pool = shuffle(byLength[slot.length] ?? []);
    const best =
      pool.find((e) => !used.has(e.word) && slot.cells.every((ci, k) =>
        answers[ci] === undefined || answers[ci] === e.word[k]
      )) ?? pool.find((e) => !used.has(e.word));

    const word = best?.word ?? Array.from({ length: slot.length }, (_, i) =>
      String.fromCharCode(65 + (i % 26))
    ).join("");
    const clue = best?.clue ?? "–";
    used.add(word);
    slot.cells.forEach((ci, k) => { if (answers[ci] === undefined) answers[ci] = word[k]!; });
    return { ...slot, word, clue };
  });

  return { filled, answers };
}
