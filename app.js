const CHAT_STORAGE_KEY = "darnellsSupportChat.v1";
const MAX_HISTORY = 38;
let conversation = [];
let pendingMessage = "";
let isSending = false;
let currentRequest = null;
let chatVersion = 0;
let recognition = null;
let isListening = false;
let speechFinished = null;
let finishSpeech = null;

const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const speakButton = document.getElementById("speakButton");
const rememberChat = document.getElementById("rememberChat");
const messages = document.getElementById("messages");
const errorBox = document.getElementById("chatError");

function supportMode() {
  return document.querySelector('input[name="supportMode"]:checked').value;
}

function contextFor(text) {
  const context = conversation.slice(-MAX_HISTORY);
  while (context.length && context.reduce((sum, message) => sum + message.content.length, text.length) > 30000) {
    context.splice(0, 2);
  }
  return [...context, {role: "user", content: text}];
}

function setError(message = "") {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function renderMessages() {
  messages.replaceChildren();
  conversation.forEach(message => appendMessage(message.role, message.content));
  if (pendingMessage) {
    appendMessage("user", pendingMessage);
    appendMessage("assistant", "Thinking about what you've shared…", true);
  }
  messages.setAttribute("aria-busy", String(isSending));
  document.getElementById("starters").hidden = conversation.length > 0 || isSending;
}

function appendMessage(role, content, pending = false) {
  const article = document.createElement("article");
  article.className = "message " + role + (pending ? " pending" : "");
  const label = document.createElement("p");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "AI support";
  const text = document.createElement("p");
  text.className = "message-content";
  text.textContent = content;
  article.append(label, text);
  messages.appendChild(article);
}

function saveIfWanted() {
  if (!rememberChat.checked) return;
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      version: 1, messages: conversation.slice(-MAX_HISTORY),
      mode: supportMode(), draft: input.value.slice(0, 4000)
    }));
    document.getElementById("storageStatus").textContent = "This chat is saved in this browser. Turn this off to remove the saved copy.";
  } catch (error) {
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      rememberChat.checked = false;
      document.getElementById("storageStatus").textContent = "This browser couldn't save the chat. Any older saved copy was removed. Keep this page open to keep talking.";
    } catch (removeError) {
      rememberChat.checked = true;
      document.getElementById("storageStatus").textContent = "This browser couldn't update or remove the saved chat. Clear this site's browser data to remove it.";
    }
  }
}

function restoreChat() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "null");
    if (!saved || saved.version !== 1 || !Array.isArray(saved.messages)) return;
    const valid = saved.messages.length <= MAX_HISTORY && saved.messages.length % 2 === 0 &&
      saved.messages.every((message, index) =>
        message && message.role === (index % 2 ? "assistant" : "user") &&
        typeof message.content === "string" && message.content.length > 0 && message.content.length <= 8000);
    if (!valid) return;
    conversation = saved.messages;
    input.value = typeof saved.draft === "string" ? saved.draft.slice(0, 4000) : "";
    const mode = saved.mode === "next_step" ? "next_step" : "listen";
    document.querySelector('input[name="supportMode"][value="' + mode + '"]').checked = true;
    rememberChat.checked = true;
    document.getElementById("storageStatus").textContent = "Your saved chat is here. Turn saving off to remove the saved copy.";
  } catch (error) {
    document.getElementById("storageStatus").textContent = "Saved chat data couldn't be opened. You can still start a new conversation.";
  }
}

async function finishDictation() {
  if (!speechFinished) return;
  try { recognition.stop(); } catch (error) { /* Wait for the final speech event. */ }
  await speechFinished;
}

async function sendMessage(starter) {
  if (isSending) return;
  isSending = true;
  sendButton.disabled = true;
  setError();
  const version = chatVersion;
  try {
    await finishDictation();
    if (version !== chatVersion) return;
    const text = typeof starter === "string" ? starter.trim() : input.value.trim();
    if (!text) { setError("Start with a few words about what's on your mind."); return; }
    if (text.length > 4000) { setError("Please send a shorter message, up to 4,000 characters."); return; }
    input.value = text;
    pendingMessage = text;
    input.disabled = true;
    speakButton.disabled = true;
    renderMessages();
    currentRequest = new AbortController();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        messages: contextFor(text),
        mode: supportMode()
      }),
      signal: currentRequest.signal
    });
    let data;
    try { data = await response.json(); }
    catch (error) { throw new Error("The reply couldn't load. Your message is still here; try again."); }
    if (version !== chatVersion) return;
    if (!response.ok) throw new Error(data.error || "The reply couldn't load. Your message is still here; try again.");
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The reply was empty. Your message is still here; try again.");
    conversation.push({role: "user", content: text}, {role: "assistant", content: data.reply});
    conversation = conversation.slice(-MAX_HISTORY);
    input.value = "";
    saveIfWanted();
    const status = document.getElementById("connectionStatus");
    status.textContent = "Connected · Take your time.";
    status.classList.add("ready");
  } catch (error) {
    if (version === chatVersion && error.name !== "AbortError") {
      setError(error.message === "Failed to fetch"
        ? "The connection dropped. Your message is still here; try again."
        : error.message);
      saveIfWanted();
    }
  } finally {
    if (version === chatVersion) {
      pendingMessage = "";
      currentRequest = null;
      isSending = false;
      sendButton.disabled = false;
      speakButton.disabled = false;
      input.disabled = false;
      renderMessages();
    }
  }
}

async function newChat() {
  if ((conversation.length || input.value.trim() || pendingMessage) &&
      !confirm("Clear this conversation and start a new chat?")) return;
  chatVersion++;
  if (currentRequest) currentRequest.abort();
  await finishDictation();
  conversation = [];
  pendingMessage = "";
  input.value = "";
  currentRequest = null;
  isSending = false;
  sendButton.disabled = false;
  speakButton.disabled = false;
  input.disabled = false;
  setError();
  try { localStorage.removeItem(CHAT_STORAGE_KEY); }
  catch (error) { setError("The open chat is clear, but this browser couldn't remove the saved copy. Clear this site's browser data to remove it."); }
  if (rememberChat.checked) saveIfWanted();
  renderMessages();
  input.focus();
}

function setupDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = document.getElementById("voiceStatus");
  if (!SpeechRecognition) {
    speakButton.addEventListener("click", () => {
      status.textContent = "Speech-to-text isn't available here. You can type, or use your keyboard's microphone.";
      input.focus();
    });
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "en-CA";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => {
    isListening = true;
    speakButton.textContent = "⏹ Stop speaking";
    status.textContent = "Listening… say it in your own words.";
  };
  recognition.onresult = event => {
    input.value = [input.value.trim(), event.results[0][0].transcript].filter(Boolean).join(" ").slice(0, 4000);
    status.textContent = "Your words were added. You can edit them before sending.";
    saveIfWanted();
  };
  recognition.onerror = () => { status.textContent = "Speech-to-text couldn't finish. You can still type your message."; };
  recognition.onend = () => {
    isListening = false;
    speakButton.textContent = "🎙 Speak";
    speechFinished = null;
    if (finishSpeech) finishSpeech();
    finishSpeech = null;
  };
  speakButton.addEventListener("click", () => {
    if (isSending) return;
    try {
      if (isListening || speechFinished) recognition.stop();
      else {
        speechFinished = new Promise(resolve => { finishSpeech = resolve; });
        recognition.start();
      }
    } catch (error) {
      speechFinished = null;
      if (finishSpeech) finishSpeech();
      finishSpeech = null;
      status.textContent = "Speech-to-text couldn't start. You can still type your message.";
    }
  });
}

async function checkConnection() {
  const status = document.getElementById("connectionStatus");
  try {
    const response = await fetch("/api/health", {cache: "no-store"});
    if (!response.ok) throw new Error("No chat server");
    const data = await response.json();
    status.textContent = data.configured
      ? "Chat connection is set up · Take your time."
      : "AI replies aren't connected yet. The app owner needs to finish setup.";
    status.classList.toggle("ready", !!data.configured);
  } catch (error) {
    status.textContent = "AI chat needs its server connection. You can write here, but replies aren't connected.";
  }
}

document.getElementById("chatForm").addEventListener("submit", event => {
  event.preventDefault();
  sendMessage();
});
document.getElementById("newChatButton").addEventListener("click", newChat);
document.querySelectorAll("[data-starter]").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.starter));
});
rememberChat.addEventListener("change", () => {
  if (rememberChat.checked) saveIfWanted();
  else {
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      document.getElementById("storageStatus").textContent = "Saving is off. The saved copy was removed from this browser.";
    } catch (error) {
      rememberChat.checked = true;
      document.getElementById("storageStatus").textContent = "This browser couldn't remove the saved copy. Try again or clear this site's browser data.";
    }
  }
});
input.addEventListener("input", saveIfWanted);
document.querySelectorAll('input[name="supportMode"]').forEach(radio => radio.addEventListener("change", saveIfWanted));
const supportDialog = document.getElementById("supportDialog");
document.getElementById("supportButton").addEventListener("click", () => supportDialog.showModal());
document.getElementById("closeSupportButton").addEventListener("click", () => supportDialog.close());

restoreChat();
renderMessages();
setupDictation();
checkConnection();

