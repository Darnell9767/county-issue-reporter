import test from "node:test";
import assert from "node:assert/strict";
import {once} from "node:events";
import {createAppServer} from "../server.js";

async function openServer(t, options = {}) {
  const server = createAppServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return "http://127.0.0.1:" + server.address().port;
}
const body = JSON.stringify({messages: [{role: "user", content: "I've had a hard day."}], mode: "listen"});
const headers = {"Content-Type": "application/json"};

test("the page loads, health reports setup honestly and private files are never served", async t => {
  const base = await openServer(t, {env: {}});
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /A place to talk/);
  assert.match(page.headers.get("Content-Security-Policy"), /connect-src 'self'/);
  assert.deepEqual(await (await fetch(base + "/api/health")).json(), {configured: false});
  for (const path of ["/.env", "/.env.example", "/server.js", "/lib/chat.js", "/README.md"]) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  const reply = await fetch(base + "/api/chat", {method: "POST", headers, body});
  assert.equal(reply.status, 503);
  assert.match((await reply.json()).error, /finish setup/);
});

test("a valid request reaches the provider and returns only reply text", async t => {
  const base = await openServer(t, {
    env: {OPENAI_API_KEY: "test-key"},
    fetchImpl: async () => Response.json({status: "completed", output: [
      {type: "message", role: "assistant", content: [{type: "output_text", text: "That sounds tiring. What felt hardest today?"}]}
    ]})
  });
  const response = await fetch(base + "/api/chat", {method: "POST", headers, body});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {reply: "That sounds tiring. What felt hardest today?"});
});

test("invalid HTTP requests are rejected before any provider call", async t => {
  let providerCalls = 0;
  const base = await openServer(t, {env: {OPENAI_API_KEY: "test-key"}, fetchImpl: async () => { providerCalls++; }});
  assert.equal((await fetch(base + "/api/chat")).status, 405);
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers: {...headers, Origin: "https://another.example"}, body})).status, 403);
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers: {...headers, "Sec-Fetch-Site": "cross-site"}, body})).status, 403);
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers: {"Content-Type": "text/plain"}, body})).status, 415);
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers, body: "{broken"})).status, 400);
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers, body: "x".repeat(270000)})).status, 413);
  assert.equal(providerCalls, 0);
});

test("per-process rate limiting pauses requests and then resets", async t => {
  let clock = 1000;
  const base = await openServer(t, {env: {}, requestsPerMinute: 1, now: () => clock});
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers, body})).status, 503);
  const limited = await fetch(base + "/api/chat", {method: "POST", headers, body});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  clock += 60001;
  assert.equal((await fetch(base + "/api/chat", {method: "POST", headers, body})).status, 503);
});
