// data/build-wordbank.mjs
// Converts nyt-clues.csv → wordbank.json
//
// Usage:  node data/build-wordbank.mjs
//
// Reads:  data/nyt-clues.csv   (columns: Date, Word, Clue)
// Writes: data/wordbank.json

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const MIN_LEN = 3;   // shortest word to keep
const MAX_LEN = 7;   // longest word to keep (7×7 template max)
const MAX_PER_WORD = 3; // keep up to 3 different clues per answer (variety)

// Skip clues that are too short/generic or contain spoilers like "See 14-Across"
function isGoodClue(clue) {
  if (!clue || clue.length < 4) return false;
  if (/see \d+-/i.test(clue)) return false;      // cross-references
  if (/^_+$/.test(clue)) return false;           // just underscores
  if (/with \d+-/i.test(clue)) return false;     // "with 5-Down"
  return true;
}

// ── Read CSV ──────────────────────────────────────────────────────────────────

const csvPath = join(__dir, "nyt-clues.csv");
const raw = readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/);

// Parse header to find column indices (case-insensitive)
const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
const wordCol = headers.indexOf("word");
const clueCol = headers.indexOf("clue");

if (wordCol === -1 || clueCol === -1) {
  console.error("Could not find 'Word' and 'Clue' columns in CSV.");
  console.error("Found headers:", headers);
  process.exit(1);
}

console.log(`Reading ${lines.length - 1} rows…`);

// ── Process rows ──────────────────────────────────────────────────────────────

// Map: WORD → Set of clue strings (dedupe clues per word)
const wordMap = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Simple CSV split — handle quoted fields containing commas
  const cols = splitCSVLine(line);
  const word  = (cols[wordCol] ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const clue  = (cols[clueCol] ?? "").trim().replace(/^"|"$/g, "");

  if (!word || !clue) continue;
  if (word.length < MIN_LEN || word.length > MAX_LEN) continue;
  if (!isGoodClue(clue)) continue;

  if (!wordMap.has(word)) wordMap.set(word, []);
  const existing = wordMap.get(word);

  // Avoid exact duplicate clues for the same word
  if (!existing.includes(clue) && existing.length < MAX_PER_WORD) {
    existing.push(clue);
  }
}

// ── Build output array ────────────────────────────────────────────────────────

// Each word gets one entry per clue variant (so backtracker has real variety)
const entries = [];
for (const [word, clues] of wordMap) {
  for (const clue of clues) {
    entries.push({ word, clue });
  }
}

// Sort by word length then alphabetically (makes the JSON readable)
entries.sort((a, b) => a.word.length - b.word.length || a.word.localeCompare(b.word));

// ── Stats ─────────────────────────────────────────────────────────────────────

const byLen = {};
for (const e of entries) {
  byLen[e.word.length] = (byLen[e.word.length] ?? 0) + 1;
}
console.log("Entries by word length:", byLen);
console.log("Total entries:", entries.length);
console.log("Unique words:", wordMap.size);

// ── Write wordbank.json ───────────────────────────────────────────────────────

const outPath = join(__dir, "wordbank.json");
writeFileSync(outPath, JSON.stringify(entries, null, 2));
console.log(`\n✓ Written to ${outPath}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split a single CSV line respecting double-quoted fields.
 * Handles: field,"field with, comma","field with ""quotes"""
 */
function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
