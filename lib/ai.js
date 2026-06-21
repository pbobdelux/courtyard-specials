// Plain-English board editing via the Claude API.
// Uses tool-use so Claude must return the board as validated JSON (no parsing guesswork).

import { normalizeSpecial } from "./menu";

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
