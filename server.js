import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {ChatError, generateReply} from "./lib/chat.js";

const ROOT = new URL("./", import.meta.url);
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);
const MAX_BODY_BYTES = 256 * 1024;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
};

function jsonResponse(res, status, data, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", ...headers
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
    throw new ChatError(415, "Please send the message as JSON.");
  }
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
    req.resume();
    throw new ChatError(413, "That message is too large. Please send a shorter one.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ChatError(413, "That message is too large. Please send a shorter one.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch (error) { throw new ChatError(400, "The message couldn't be read. Please try again."); }
}

function sameOrigin(req, env) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const expected = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : null;
    const parsed = new URL(origin);
    return expected ? parsed.origin === expected
      : ["http:", "https:"].includes(parsed.protocol) && parsed.host === req.headers.host;
  } catch (error) { return false; }
}

export function createAppServer({env = process.env, fetchImpl = fetch, now = Date.now, requestsPerMinute = 15} = {}) {
  // This process-local limiter is suitable for a private prototype, not a public multi-server service.
  const requests = new Map();
  return createServer(async (req, res) => {
    const path = (req.url || "/").split("?")[0];
    if (path === "/api/health" && req.method === "GET") {
      jsonResponse(res, 200, {configured: !!env.OPENAI_API_KEY?.trim()});
      return;
    }
    if (path === "/api/chat") {
      if (req.method !== "POST") {
        jsonResponse(res, 405, {error: "Please send a message using POST."}, {Allow: "POST"});
        return;
      }
      if (!sameOrigin(req, env)) {
        jsonResponse(res, 403, {error: "Please send the message from this app."});
        return;
      }
      const timestamp = now();
      for (const [ip, entry] of requests) if (entry.resetAt <= timestamp) requests.delete(ip);
      const ip = req.socket.remoteAddress || "local";
      const bucket = requests.get(ip) || {count: 0, resetAt: timestamp + 60000};
      if (bucket.count >= requestsPerMinute) {
        jsonResponse(res, 429, {error: "Please take a short pause and try again in a minute."}, {"Retry-After": "60"});
        return;
      }
      bucket.count++;
      requests.set(ip, bucket);
      try {
        const body = await readJson(req);
        const reply = await generateReply(body, {env, fetchImpl});
        jsonResponse(res, 200, {reply});
      } catch (error) {
        jsonResponse(res, error instanceof ChatError ? error.status : 500, {
          error: error instanceof ChatError ? error.message
            : "The reply couldn't load. Your message is still here; try again."
        });
      }
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      jsonResponse(res, 405, {error: "Method unavailable."}, {Allow: "GET, HEAD"});
      return;
    }
    const entry = STATIC_FILES.get(path);
    if (!entry) { jsonResponse(res, 404, {error: "Page not found."}); return; }
    try {
      const content = await readFile(new URL(entry[0], ROOT));
      res.writeHead(200, {...SECURITY_HEADERS, "Content-Type": entry[1], "Cache-Control": "no-cache"});
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) { jsonResponse(res, 500, {error: "The page couldn't load."}); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, host, () => console.log("Darnell's App: http://" + host + ":" + port));
}
