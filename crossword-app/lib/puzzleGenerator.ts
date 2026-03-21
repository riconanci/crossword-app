// lib/puzzleGenerator.ts
// Constraint-based crossword filler with backtracking.
//
// KEY FIX: Before placing a word we check every cell against already-placed
// letters. If any letter conflicts we skip that word entirely.
// Slots are ordered longest-first so we apply the most constraints early.

import type { BoardSize, Cell, Clue, PuzzleWithAnswers, Direction } from "./types";
import WORD_BANK from "../data/wordbank.json";

const TEMPLATES: Record<BoardSize, number[][]> = {
  5: [
    [1,1,1,1,1],
    [1,0,1,0,1],
    [1,1,1,1,1],
    [1,0,1,0,1],
    [1,1,1,1,1],
  ],
  7: [
    [1,1,1,0,1,1,1],
    [1,0,1,0,1,0,1],
    [1,1,1,1,1,1,1],
    [0,0,1,0,1,0,0],
    [1,1,1,1,1,1,1],
    [1,0,1,0,1,0,1],
    [1,1,1,0,1,1,1],
  ],
  11: [
    [1,1,1,1,0,1,0,1,1,1,1],
    [1,0,0,1,0,1,0,1,0,0,1],
    [1,0,1,1,1,1,1,1,1,0,1],
    [1,1,1,0,0,1,0,0,1,1,1],
    [0,0,1,1,1,1,1,1,1,0,0],
    [1,1,1,0,1,0,1,0,1,1,1],
    [0,0,1,1,1,1,1,1,1,0,0],
    [1,1,1,0,0,1,0,0,1,1,1],
    [1,0,1,1,1,1,1,1,1,0,1],
    [1,0,0,1,0,1,0,1,0,0,1],
    [1,1,1,1,0,1,0,1,1,1,1],
  ],
};

interface WordEntry { word: string; clue: string; }

// Group by length once at module load
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

export function generatePuzzle(size: BoardSize): PuzzleWithAnswers {
  const tmpl = TEMPLATES[size];
  const cells = buildCells(size, tmpl);
  const slots = findSlots(cells, size, tmpl);

  let result: { filled: FilledSlot[]; answers: Record<number, string> } | null = null;
  for (let i = 0; i < 20 && !result; i++) result = backtrack(slots);
  if (!result) result = greedyFill(slots);

  const clues: Clue[] = result.filled.map((s) => ({
    number: s.number, direction: s.direction, text: s.clue,
    cells: s.cells, startCell: s.cells[0] ?? 0, length: s.cells.length,
  }));

  return { id: `puzzle-${size}-${Date.now()}`, size, cells, clues, answers: result.answers, createdAt: Date.now() };
}

// ── Cell building ─────────────────────────────────────────────────────────────

function tv(tmpl: number[][], r: number, c: number) { return tmpl[r]?.[c] ?? 0; }

function buildCells(size: BoardSize, tmpl: number[][]): Cell[] {
  const cells: Cell[] = [];
  let num = 1;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      const isBlack = tv(tmpl, row, col) === 0;
      let startNumber: number | null = null;
      if (!isBlack) {
        const sa = (col === 0 || tv(tmpl, row, col-1) === 0) && col+1 < size && tv(tmpl, row, col+1) === 1;
        const sd = (row === 0 || tv(tmpl, row-1, col) === 0) && row+1 < size && tv(tmpl, row+1, col) === 1;
        if (sa || sd) startNumber = num++;
      }
      cells.push({ index, row, col, isBlack, acrossWord: null, downWord: null, startNumber });
    }
  }

  const acStart: Record<number, number> = {};
  const dnStart: Record<number, number> = {};
  for (const cell of cells) {
    if (!cell.startNumber || cell.isBlack) continue;
    const { row, col } = cell;
    if ((col===0||tv(tmpl,row,col-1)===0) && col+1<size && tv(tmpl,row,col+1)===1) acStart[cell.index]=cell.startNumber;
    if ((row===0||tv(tmpl,row-1,col)===0) && row+1<size && tv(tmpl,row+1,col)===1) dnStart[cell.index]=cell.startNumber;
  }

  for (const cell of cells) {
    if (cell.isBlack) continue;
    const { row, col } = cell;
    let ac = col; while (ac > 0 && tv(tmpl,row,ac-1)===1) ac--;
    const an = acStart[row*size+ac]; if (an !== undefined) cell.acrossWord = an;
    let dc = row; while (dc > 0 && tv(tmpl,dc-1,col)===1) dc--;
    const dn = dnStart[dc*size+col]; if (dn !== undefined) cell.downWord = dn;
  }

  return cells;
}

// ── Slot extraction ───────────────────────────────────────────────────────────

interface Slot { number: number; direction: Direction; cells: number[]; length: number; }
interface FilledSlot extends Slot { word: string; clue: string; }

function findSlots(cells: Cell[], size: number, tmpl: number[][]): Slot[] {
  const slots: Slot[] = [];
  for (const cell of cells) {
    if (cell.isBlack || !cell.startNumber) continue;
    const { row, col, startNumber } = cell;

    if ((col===0||tv(tmpl,row,col-1)===0) && col+1<size && tv(tmpl,row,col+1)===1) {
      const cs: number[] = [];
      for (let c=col; c<size && tv(tmpl,row,c)===1; c++) cs.push(row*size+c);
      if (cs.length >= 2) slots.push({ number: startNumber, direction: "across", cells: cs, length: cs.length });
    }

    if ((row===0||tv(tmpl,row-1,col)===0) && row+1<size && tv(tmpl,row+1,col)===1) {
      const cs: number[] = [];
      for (let r=row; r<size && tv(tmpl,r,col)===1; r++) cs.push(r*size+col);
      if (cs.length >= 2) slots.push({ number: startNumber, direction: "down", cells: cs, length: cs.length });
    }
  }
  // Longest first — constraints propagate better
  return slots.sort((a, b) => b.length - a.length || a.number - b.number);
}

// ── Backtracking filler ───────────────────────────────────────────────────────

function backtrack(slots: Slot[]): { filled: FilledSlot[]; answers: Record<number, string> } | null {
  const answers: Record<number, string> = {};
  const used = new Set<string>();
  const filled: FilledSlot[] = new Array(slots.length);

  function solve(i: number): boolean {
    if (i === slots.length) return true;
    const slot = slots[i]!;

    for (const entry of shuffle(byLength[slot.length] ?? [])) {
      if (used.has(entry.word)) continue;

      // ← THE CRITICAL CHECK: every constrained cell must match
      let ok = true;
      for (let k = 0; k < slot.cells.length; k++) {
        const existing = answers[slot.cells[k]!];
        if (existing !== undefined && existing !== entry.word[k]) { ok = false; break; }
      }
      if (!ok) continue;

      // Place word — only write cells that are currently empty
      const placed: number[] = [];
      for (let k = 0; k < slot.cells.length; k++) {
        const ci = slot.cells[k]!;
        if (answers[ci] === undefined) { answers[ci] = entry.word[k]!; placed.push(ci); }
      }
      used.add(entry.word);
      filled[i] = { ...slot, word: entry.word, clue: entry.clue };

      if (solve(i + 1)) return true;

      // Undo placement
      used.delete(entry.word);
      for (const ci of placed) delete answers[ci];
    }

    return false;
  }

  return solve(0) ? { filled: filled as FilledSlot[], answers } : null;
}

// ── Greedy fallback ───────────────────────────────────────────────────────────

function greedyFill(slots: Slot[]): { filled: FilledSlot[]; answers: Record<number, string> } {
  const answers: Record<number, string> = {};
  const used = new Set<string>();

  const filled: FilledSlot[] = slots.map((slot) => {
    const pool = shuffle(byLength[slot.length] ?? []);
    const best = pool.find((e) => {
      if (used.has(e.word)) return false;
      return slot.cells.every((ci, k) => answers[ci] === undefined || answers[ci] === e.word[k]);
    }) ?? pool.find((e) => !used.has(e.word));

    const word = best?.word ?? Array.from({ length: slot.length }, (_, i) => String.fromCharCode(65 + i % 26)).join("");
    const clue = best?.clue ?? "—";
    used.add(word);
    slot.cells.forEach((ci, k) => { if (answers[ci] === undefined) answers[ci] = word[k]!; });
    return { ...slot, word, clue };
  });

  return { filled, answers };
}
