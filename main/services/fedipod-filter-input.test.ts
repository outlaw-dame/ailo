import assert from "node:assert/strict";
import test from "node:test";

import { requireFilterKeywords } from "./fedipod-filter-input.js";

test("honors a client-chosen semantic model instead of hardcoding local", () => {
  const [openai] = requireFilterKeywords([
    { keyword: "spoilers", semanticModel: "openai-text-embedding-3-small" },
  ]);
  assert.equal(openai.semanticModel, "openai-text-embedding-3-small", "OpenAI was picked, and must survive");

  const [gemini] = requireFilterKeywords([
    { keyword: "spoilers", semanticModel: "gemini-embedding-2" },
  ]);
  assert.equal(gemini.semanticModel, "gemini-embedding-2");
});

test("falls back to the local model for an unrecognized or missing value", () => {
  const [unrecognized] = requireFilterKeywords([{ keyword: "spoilers", semanticModel: "gpt-5" }]);
  assert.equal(unrecognized.semanticModel, "embeddinggemma-300m");

  const [missing] = requireFilterKeywords([{ keyword: "spoilers" }]);
  assert.equal(missing.semanticModel, "embeddinggemma-300m");
});

test("keeps several keyword rows, each with its own model, and drops empty ones", () => {
  const rows = requireFilterKeywords([
    { keyword: "spoilers", semanticModel: "openai-text-embedding-3-small" },
    { keyword: "  " },
    { keyword: "season finale", semanticModel: "embeddinggemma-300m", wholeWord: true },
  ]);
  assert.equal(rows.length, 2, "the blank row is dropped");
  assert.equal(rows[0].keyword, "spoilers");
  assert.equal(rows[0].semanticModel, "openai-text-embedding-3-small");
  assert.equal(rows[1].keyword, "season finale");
  assert.equal(rows[1].wholeWord, true);
});

test("rejects a filter with no usable keyword", () => {
  assert.throws(() => requireFilterKeywords([]), /at least one keyword/);
  assert.throws(() => requireFilterKeywords([{ keyword: "   " }]), /at least one keyword/);
  assert.throws(() => requireFilterKeywords("not an array"), /at least one keyword/);
});

test("clamps an out-of-range semantic threshold instead of storing it as given", () => {
  const [tooHigh] = requireFilterKeywords([{ keyword: "x", semanticThreshold: 5 }]);
  assert.equal(tooHigh.semanticThreshold, 0.9);
  const [tooLow] = requireFilterKeywords([{ keyword: "x", semanticThreshold: -1 }]);
  assert.equal(tooLow.semanticThreshold, 0.3);
});
