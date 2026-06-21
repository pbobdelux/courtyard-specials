// Learning memory: the system records every approve/reject decision and distills
// the owner's taste into an evolving style guide that's fed into the AI on every
// future request — so it gets better the more the owner uses it.

import { kvGet, kvSet } from "./store";
import { resolveDesign } from "./themes";

const PREFS_KEY = "prefs:style"; // distilled style guide (injected into the agent)
const EVENTS_KEY = "prefs:events"; // recent raw decisions
const MAX_EVENTS = 24;

export async function getPrefs() {
  return (await kvGet(PREFS_KEY)) || "";
}

function boardSummary(board) {
  if (!board) return "(none)";
  const d = resolveDesign(board.design);
  const items = (board.entrees || []).map((e) => `${e.name} $${e.price}${e.note ? ` (${e.note})` : ""}`).join(", ");
  return (
    `featured: ${board.featured?.name || "-"} $${board.featured?.price || ""}; ` +
    `entrees: ${items}; sides: ${(board.sides || []).join(", ")}; soups: ${(board.soups || []).join(", ")}; ` +
    `design: theme=${d.themeKey}, bg=${d.bg}, accent=${d.accent}, heading=${d.headingKey}, body=${d.bodyKey}, frame=${d.frame}`
  );
}

// Record an approve/reject and refresh the distilled style guide.
export async function recordDecision({ type, board, feedback }) {
  try {
    const events = (await kvGet(EVENTS_KEY)) || [];
    events.push({ type, summary: boardSummary(board), feedback: feedback || "" });
    const trimmed = events.slice(-MAX_EVENTS);
    await kvSet(EVENTS_KEY, trimmed);
    await reflect(trimmed);
  } catch (e) {
    console.error("recordDecision failed:", e.message);
  }
}

// Use a cheap model to merge the latest decisions into a concise style guide.
async function reflect(events) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;
  const current = await getPrefs();
  const recent = events
    .slice(-12)
    .map((e) => `- ${e.type.toUpperCase()}${e.feedback ? ` — feedback: "${e.feedback}"` : ""}: ${e.summary}`)
    .join("\n");

  const sys = `You maintain a CONCISE style guide capturing a restaurant owner's preferences for their daily-specials board, learned from their APPROVE/REJECT decisions and feedback. Capture durable, repeated patterns about: design (themes, colors, fonts, frames), layout/density, wording/naming, and pricing. APPROVED boards show what they like; REJECTED + feedback show what to avoid and the correction. Merge new insights into the existing guide, drop one-offs and resolve contradictions in favor of the most consistent/recent pattern, and keep it tight (max 12 short bullets). Output ONLY the bullet list.`;
  const user = `CURRENT GUIDE:\n${current || "(empty)"}\n\nRECENT DECISIONS (newest last):\n${recent}\n\nUpdated guide:`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_REFLECT_MODEL || "claude-haiku-4-5",
      max_tokens: 700,
      system: sys,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) return;
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  if (text) await kvSet(PREFS_KEY, text.slice(0, 2200));
}
