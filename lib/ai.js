// Claude API: a conversational, multimodal assistant for the specials board.
// Uses tool-use so board changes come back as validated JSON (no parsing guesswork).

import { normalizeSpecial, RESTAURANT_NAME } from "./menu";

const UPDATE_TOOL = {
  name: "update_board",
  description:
    "Return the COMPLETE updated daily-specials board after applying the requested change. Always include every section, carrying over anything that wasn't changed.",
  input_schema: {
    type: "object",
    properties: {
      featured: {
        type: "object",
        description: "The single highlighted item shown in blue at the top.",
        properties: {
          name: { type: "string" },
          price: { type: "string", description: "Number only, no dollar sign, e.g. '11'." },
        },
        required: ["name", "price"],
      },
      entrees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "string", description: "Number only, no dollar sign." },
            note: { type: "string", description: "Optional small note, e.g. 'Salmon, Cod, Shrimp'. Empty string if none." },
          },
          required: ["name", "price"],
        },
      },
      sides: { type: "array", items: { type: "string" } },
      soups: { type: "array", items: { type: "string" } },
    },
    required: ["featured", "entrees", "sides", "soups"],
  },
};

const SYSTEM = `You edit a restaurant's daily-specials chalkboard.
You are given the CURRENT board as JSON and a plain-English instruction from the owner.
Apply ONLY what the instruction asks and keep everything else exactly as it was.
Prices are plain numbers with no dollar sign. Keep item names in Title Case.
Always return the full board via the update_board tool.`;

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// current: the board to start from (live or draft). instruction: the owner's words.
export async function aiEditBoard({ current, instruction }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const base = normalizeSpecial(current || {});
  const compact = {
    featured: base.featured,
    entrees: base.entrees,
    sides: base.sides,
    soups: base.soups,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools: [UPDATE_TOOL],
      tool_choice: { type: "tool", name: "update_board" },
      messages: [
        {
          role: "user",
          content: `CURRENT board:\n${JSON.stringify(compact, null, 2)}\n\nINSTRUCTION:\n${instruction}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolUse = (data.content || []).find((c) => c.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a board update");

  return normalizeSpecial(toolUse.input);
}

function agentSystem(currentBoard, dateStr, holiday) {
  const holidayLine = holiday?.today
    ? `Today is ${holiday.today.name} (${holiday.today.greeting}).`
    : "No holiday today.";
  const upcoming = holiday?.upcoming
    ? `Upcoming: ${holiday.upcoming.name} on ${holiday.upcoming.label}.`
    : "";
  return `You are Claude, helping the owner of ${RESTAURANT_NAME} run their daily-specials board, chatting in Slack. Be warm, concise, and genuinely helpful. You can help with anything the owner asks — you are NOT limited to the board.

THE BOARD: a digital chalkboard shown on a TV — a featured item (name + price), a list of entrées (name, price, optional small note), sides, and soups. Its visual look is a fixed chalkboard template defined in code: you can change the CONTENT, but you cannot redesign the template itself.

TOOL — update_board: call it ONLY when the owner wants to create or change today's board. It produces a visual proof they approve or reject in Slack. When you call it, return the COMPLETE board, carrying over anything that wasn't changed. For anything that is not a board change (questions, ideas, brainstorming, chit-chat), just reply with text and do NOT call the tool.

REFERENCE PHOTOS: the owner may send images. Infer why from their words + the image. Examples: a photo of a handwritten/printed specials list → read it carefully and transcribe the items and prices into the board; a dish photo → use it for naming/description ideas; an example board or wording they like → match the style of the wording (not the template). If you genuinely can't tell what they want changed, ask one short clarifying question instead of guessing.

CONTEXT
- Restaurant: ${RESTAURANT_NAME}
- Date: ${dateStr}. ${holidayLine} ${upcoming}
- Current board:
${JSON.stringify(currentBoard, null, 2)}

Keep replies short and friendly — this is Slack. When you update the board, add a one-line note about what changed.`;
}

// Conversational, multimodal turn. history = [{role, content:string}], images = [{media_type, data(base64)}].
// Returns { reply, boardUpdate }. boardUpdate is set only if Claude chose to change the board.
export async function aiAgent({ history = [], userText = "", images = [], currentBoard, dateStr, holiday }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const userContent = [];
  for (const img of images) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    });
  }
  userContent.push({ type: "text", text: userText || "(see the attached image)" });
  messages.push({ role: "user", content: userContent });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "claude-sonnet-4-6",
      max_tokens: 1500,
      system: agentSystem(currentBoard, dateStr, holiday),
      tools: [UPDATE_TOOL],
      messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  let reply = "";
  let boardUpdate = null;
  for (const c of data.content || []) {
    if (c.type === "text") reply += c.text;
    if (c.type === "tool_use" && c.name === "update_board") boardUpdate = normalizeSpecial(c.input);
  }
  return { reply: reply.trim(), boardUpdate };
}
