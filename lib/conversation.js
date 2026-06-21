// Per-thread conversation memory so the Slack bot feels like a real chat.
// Stored in Redis under convo:<thread_ts>, capped to the last several turns.
// We persist text only (images are passed live in the turn they're sent).

import { kvGet, kvSet } from "./store";

const MAX_MESSAGES = 12;
const key = (thread) => `convo:${thread}`;

export async function getHistory(thread) {
  if (!thread) return [];
  return (await kvGet(key(thread))) || [];
}

export async function appendHistory(thread, userText, assistantText) {
  if (!thread) return;
  const h = await getHistory(thread);
  h.push({ role: "user", content: userText || "(image)" });
  h.push({ role: "assistant", content: assistantText || "(no reply)" });
  await kvSet(key(thread), h.slice(-MAX_MESSAGES));
}
