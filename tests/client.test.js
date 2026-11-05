import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
const STORAGE_KEY = "darnellsSupportChat.v1";

class Element {
  constructor() {
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this._text = "";
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  async dispatch(name) { for (const fn of this.listeners[name] || []) await fn({preventDefault() {}}); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function setup({saved = new Map(), chatFetch, speech = false, failWrite = false, failRemove = false} = {}) {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const modes = ["listen", "next_step"].map(value => Object.assign(new Element(), {value}));
  for (const mode of modes) {
    let checked = mode.value === "listen";
    Object.defineProperty(mode, "checked", {
      get: () => checked,
      set: value => {
        checked = value;
        if (value) modes.filter(other => other !== mode).forEach(other => { other.checked = false; });
      }
    });
  }
  const starters = [...html.matchAll(/data-starter="([^"]+)"/g)].map(match =>
    Object.assign(new Element(), {dataset: {starter: match[1]}}));
  const calls = [];
  const document = {
    getElementById: id => { assert.ok(nodes.has(id), "Known HTML element: " + id); return nodes.get(id); },
    querySelectorAll: selector => selector === "[data-starter]" ? starters : modes,
    querySelector: selector => selector.includes(":checked") ? modes.find(mode => mode.checked)
      : modes.find(mode => selector.includes('value="' + mode.value + '"')),
    createElement: tag => Object.assign(new Element(), {tag})
  };
  class SpeechRecognition {
    start() { this.onstart(); }
    stop() {
      if (this.stopping) return;
      this.stopping = true;
      queueMicrotask(() => {
        this.onresult({results: [[{transcript: "I tried something difficult today."}]]});
        this.onend();
        this.stopping = false;
      });
    }
  }
  const context = vm.createContext({
    document, AbortController, console, confirm: () => true,
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => { if (failWrite) throw new Error("Quota"); saved.set(key, value); },
      removeItem: key => { if (failRemove) throw new Error("Blocked"); saved.delete(key); }
    },
    fetch: async (url, options) => {
      if (url === "/api/health") return Response.json({configured: true});
      calls.push({url, options, payload: JSON.parse(options.body)});
      return chatFetch ? chatFetch(url, options) : Response.json({reply: "That took effort. What helped you keep going?"});
    },
    ...(speech ? {SpeechRecognition} : {})
  });
  context.window = context;
  vm.runInContext(source, context);
  return {
    saved, nodes, modes, calls, context,
    el: id => document.getElementById(id),
    run: expression => vm.runInContext(expression, context),
    history: () => JSON.parse(vm.runInContext("JSON.stringify(conversation)", context))
  };
}

test("typed chat sends the selected mode, renders text safely and stays unsaved by default", async () => {
  const e = setup();
  const unsafe = '<img src=x onerror="alert(1)"> I had a hard day.';
  e.el("messageInput").value = unsafe;
  e.modes[1].checked = true;
  await e.run("sendMessage()");
  assert.equal(e.calls[0].payload.mode, "next_step");
  assert.equal(e.calls[0].payload.messages[0].content, unsafe);
  assert.equal(e.history().length, 2);
  assert.equal(e.el("messages").children[0].children[1].textContent, unsafe);
  assert.equal(e.el("messages").children[0].children[1].children.length, 0);
  assert.equal(e.saved.has(STORAGE_KEY), false);
  assert.equal(e.el("messageInput").value, "");
  assert.equal(e.el("messageInput").disabled, false);
});

test("a failed reply preserves the message and allows retry without adding fake or duplicate replies", async () => {
  let attempts = 0;
  const e = setup({chatFetch: async () => {
    attempts++;
    return attempts === 1 ? Response.json({error: "Try again later."}, {status: 503}) : Response.json({reply: "I'm ready to listen."});
  }});
  e.el("messageInput").value = "I need to vent.";
  await e.run("sendMessage()");
  assert.equal(e.el("messageInput").value, "I need to vent.");
  assert.equal(e.history().length, 0);
  assert.equal(e.el("chatError").textContent, "Try again later.");
  assert.equal(e.el("sendButton").disabled, false);
  await e.run("sendMessage()");
  assert.equal(e.history().length, 2);
  assert.equal(e.el("chatError").hidden, true);
});

test("saving is opt-in, restores a chat and removes only this app's saved copy when turned off", async () => {
  const storage = new Map([["countyReports", "old road reports"]]);
  const e = setup({saved: storage});
  e.el("rememberChat").checked = true;
  e.el("messageInput").value = "I made it through a difficult morning.";
  await e.run("sendMessage()");
  assert.equal(storage.has(STORAGE_KEY), true);
  const reload = setup({saved: storage});
  assert.equal(reload.history().length, 2);
  assert.equal(reload.el("rememberChat").checked, true);
  reload.el("rememberChat").checked = false;
  await reload.el("rememberChat").dispatch("change");
  assert.equal(storage.has(STORAGE_KEY), false);
  assert.equal(storage.get("countyReports"), "old road reports");
});

test("new chat clears saved content and ignores a late response from an aborted conversation", async () => {
  let complete;
  const e = setup({chatFetch: () => new Promise(resolve => { complete = resolve; })});
  e.el("rememberChat").checked = true;
  e.el("messageInput").value = "My old conversation.";
  const sending = e.run("sendMessage()");
  await tick();
  assert.equal(e.el("messageInput").disabled, true);
  await e.run("newChat()");
  complete(Response.json({reply: "A late response that must not come back."}));
  await sending;
  assert.equal(e.history().length, 0);
  assert.equal(e.el("messageInput").value, "");
  assert.equal(e.el("messageInput").disabled, false);
  assert.equal(JSON.parse(e.saved.get(STORAGE_KEY)).messages.length, 0);
});

test("send waits for final dictation text and prevents concurrent sends", async () => {
  const e = setup({speech: true});
  await e.el("speakButton").dispatch("click");
  await e.run("Promise.all([sendMessage(), sendMessage()])");
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0].payload.messages[0].content, "I tried something difficult today.");
  assert.equal(e.history().length, 2);
});

test("context trimming keeps complete turns and stays within server limits", () => {
  const e = setup();
  e.run('conversation = Array.from({length: 38}, (_, index) => ({role: index % 2 ? "assistant" : "user", content: "x".repeat(1500)}))');
  const context = JSON.parse(e.run('JSON.stringify(contextFor("x".repeat(4000)))'));
  assert.equal(context[0].role, "user");
  assert.equal(context.at(-1).role, "user");
  assert.equal(context.length % 2, 1);
  assert.ok(context.reduce((sum, item) => sum + item.content.length, 0) <= 30000);
});

test("storage failures do not falsely claim an old saved chat was removed", async () => {
  const saved = new Map([[STORAGE_KEY, JSON.stringify({version: 1, messages: [], mode: "listen", draft: "An older draft"})]]);
  const e = setup({saved, failWrite: true, failRemove: true});
  e.el("messageInput").value = "A new message.";
  await e.run("sendMessage()");
  assert.equal(e.el("rememberChat").checked, true);
  assert.match(e.el("storageStatus").textContent, /couldn't update or remove/);
  assert.equal(JSON.parse(saved.get(STORAGE_KEY)).draft, "An older draft");
});

test("human support stays available without an AI response", async () => {
  const e = setup();
  await e.el("supportButton").dispatch("click");
  assert.equal(e.el("supportDialog").open, true);
  await e.el("closeSupportButton").dispatch("click");
  assert.equal(e.el("supportDialog").open, false);
  assert.match(html, /tel:988\?oai_link_source=model_response_hotline/);
  assert.match(html, /Suicide crisis support in Canada/);
});
