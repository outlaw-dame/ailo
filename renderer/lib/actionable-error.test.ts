import assert from "node:assert/strict";
import test from "node:test";
import { actionableError } from "./actionable-error.js";

test("removes IPC and HTTP wrappers while preserving the actionable cause", () => {
  assert.equal(actionableError(new Error("Error invoking remote method 'fedipod:testProviderCredential': Error: FediPod request failed (422): Gemini rejected this API key."), "Failed"), "Gemini rejected this API key.");
  assert.equal(actionableError(new Error("network offline"), "Failed"), "network offline");
});
