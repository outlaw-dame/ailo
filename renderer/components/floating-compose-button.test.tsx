import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FloatingComposeButton } from "./floating-compose-button.js";

// RTL doesn't auto-unmount between node:test cases the way it does under
// Jest/Vitest's global afterEach — without this, each test's DOM nodes pile
// up in the shared jsdom document and later tests' queries can match stale
// elements from an earlier test.
afterEach(() => cleanup());

test("is reachable and clickable when visible", async () => {
  const user = userEvent.setup();
  let clicked = false;
  render(<FloatingComposeButton visible onClick={() => { clicked = true; }} />);

  const button = screen.getByRole("button", { name: /compose/i });
  assert.equal(button.tabIndex, 0, "a visible button stays in the tab order");

  await user.click(button);
  assert.equal(clicked, true);
});

test("stays in the DOM but out of the tab order while hidden (mid-transition, not unmounted)", () => {
  render(<FloatingComposeButton visible={false} onClick={() => {}} />);
  const button = screen.getByRole("button", { name: /compose/i });
  assert.equal(button.tabIndex, -1, "hidden means untabbable, not absent — see the component's own fade/lift comment");
});
