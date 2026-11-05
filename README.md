# Darnell's App — A place to talk

**AI conversations with positive, grounded feedback.**

A simple mental health support app for people who need somewhere to talk. Share what's bothering you, talk about your day or celebrate a small win.

The companion is AI. It offers general support and encouragement; it does not provide therapy or replace a qualified clinician.

## Try the hosted app

[Open Darnell's App](https://darnells-support-chat.goodlyfolio2.chatgpt.site)

This is a private test app and uses ChatGPT sign-in. Hosting is ready. Live AI replies still need the OpenAI Developers connection and server API key setup.

## What works now

- **One chat screen:** Type a message and get an AI reply once the server is connected.
- **Just listen:** Space to vent, with reflection and encouragement.
- **Gentle ideas:** Support plus one small, manageable next step.
- **Speak your message:** Browser speech-to-text where supported. You can edit the words before sending.
- **Optional saved chat:** Off by default. Turn on **Keep this chat on this device** to return to it.
- **Start fresh:** **New chat** clears the current conversation.
- **Human support:** A separate button opens support information, including Canadian crisis resources.

Encouragement should recognize real effort and strengths. The AI is instructed to avoid empty reassurance, diagnoses, medication advice and agreeing with harmful or unsupported beliefs.

## How to use it

1. Type what's on your mind, tap **Speak**, or choose a starting prompt.
2. Choose **Just listen** or **Gentle ideas**.
3. Tap **Send message**.
4. Keep talking at your own pace.

No account is required for the local prototype. The hosted test uses ChatGPT sign-in. A server connection and API key are required for AI replies. If they are missing, the app says so rather than inventing a reply.

## Run it

Use Node.js 22.9 or later. There are no package dependencies to install.

1. Copy `.env.example` to `.env`.
2. Add an OpenAI API key to `OPENAI_API_KEY` in that file.
3. Run `npm start`.
4. Open [localhost:3000](http://localhost:3000).

Keep the key on the server. Never put it in browser code or commit `.env`.

The local server listens on localhost by default. The hosted version runs the same chat interface through a server API. GitHub Pages alone cannot run the AI endpoint.

Run `npm test` for the client-flow and server tests.

## Your conversation

Messages and recent chat context are sent to OpenAI for a response. This app server does not store chat records or log conversation text. Requests use `store: false`; the AI provider's separate data policies still apply.

Browser saving is optional. Other people using the same browser may be able to read a saved chat. Turn saving off or use **New chat** to clear it.

The chat is not monitored by a person. The **Get human support** button is available without waiting for an AI response.

## Still planned

- Connect the production API key, then test live AI conversations.
- Check response quality across real mental health support scenarios with qualified reviewers.
- Review access and add shared rate limits before opening a public service.

The current server has request limits, a process-local rate limit and protected server-side credentials. It is a private prototype, not a production therapy service.

## Project history

This repository began as County Issue Reporter. The August 18, 2026 commits added guided reporting, a map and saved attachments. The app's purpose has since changed to supportive AI conversations. The old road-report storage is left untouched.

API implementation follows the [official OpenAI documentation](https://developers.openai.com/api/docs/guides/text) and [Responses API storage guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses).
