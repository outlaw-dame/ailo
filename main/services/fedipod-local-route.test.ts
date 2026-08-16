import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocalFediPodBase } from "./fedipod-local-route.js";

const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body }) as Response;

test("uses loopback only when a paired ready daemon proves the configured host", async () => {
  assert.equal(await resolveLocalFediPodBase("https://ailo.example", "gate", reply({ ready: true, allowedHosts: ["ailo.example"] })), "http://127.0.0.1:8030");
  assert.equal(await resolveLocalFediPodBase("https://other.example", "gate", reply({ ready: true, allowedHosts: ["ailo.example"] })), null);
  assert.equal(await resolveLocalFediPodBase("https://ailo.example", null, reply({ ready: true, allowedHosts: ["ailo.example"] })), null);
});

test("fails closed when the loopback proof is malformed or unavailable", async () => {
  assert.equal(await resolveLocalFediPodBase("https://ailo.example", "gate", reply({ ready: true, allowedHosts: [1] })), null);
  assert.equal(await resolveLocalFediPodBase("https://ailo.example", "gate", async () => { throw new Error("offline"); }), null);
});
