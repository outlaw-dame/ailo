import assert from "node:assert/strict";
import test from "node:test";

import { renderMfm } from "./mfm.js";

test("renders core MFM formatting and allowlisted effects", () => {
  const html = renderMfm("**bold** $[tada hello] `code`");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /class="mfm-fn mfm-tada"/);
  assert.match(html, /<code>code<\/code>/);
});

test("escapes markup and refuses active URL schemes", () => {
  const html = renderMfm("<img src=x onerror=alert(1)> [click](javascript:alert(1))");
  assert.doesNotMatch(html, /<img|href="javascript:/i);
  assert.match(html, /&lt;img/);
});

test("unknown effects degrade to their readable children", () => {
  assert.equal(renderMfm("$[unknown readable]"), "readable");
});
