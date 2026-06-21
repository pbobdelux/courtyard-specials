// Claude API: a conversational, multimodal assistant for the specials board.
// Uses tool-use so board changes come back as validated JSON (no parsing guesswork).

import { normalizeSpecial, RESTAURANT_NAME } from "./menu";
import { THEME_KEYS, FONT_KEYS, FRAMES, THEMES, describeDesign } from "./themes";

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
      design: {
        type: "object",
        description:
          "OPTIONAL visual design. OMIT entirely to keep the current look. To restyle, set a `theme` and/or override individual properties. Always keep strong contrast so text is readable on a TV.",
        properties: {
          theme: { type: "string", enum: THEME_KEYS, description: "A preset look (sets colors, fonts, and frame)." },
          bg: { type: "string", description: "CSS background — hex like '#142013' or a gradient. Overrides the theme background." },
          text: { type: "string", description: "Main text color (hex)." },
          accent: { type: "string", description: "Heading/accent color (hex)." },
          heading: { type: "string", enum: FONT_KEYS, description: "Heading font." },
          body: { type: "string", enum: FONT_KEYS, description: "Body font." },
          frame: { type: "string", enum: FRAMES, description: "Border style around the board." },
        },
      },
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

function agentSystem(currentBoard, dateStr, holiday, prefs) {
  const holidayLine = holiday?.today
    ? `Today is ${holiday.today.name} (${holiday.today.greeting}).`
    : "No holiday today.";
  const upcoming = holiday?.upcoming
    ? `Upcoming: ${holiday.upcoming.name} on ${holiday.upcoming.label}.`
    : "";
  const themeList = THEME_KEYS.map((k) => `${k} (${THEMES[k].label})`).join(", ");
  return `You are Claude, the graphic-design assistant for ${RESTAURANT_NAME}'s daily-specials board, chatting with the owner in Slack. Be warm, concise, and genuinely helpful. You can help with anything the owner asks — you are NOT limited to the board.

THE BOARD: a digital sign shown on a TV — a featured item (name + price), a list of entrées (name, price, optional small note), sides, and soups. You control BOTH its content AND its visual design.

DESIGN CONTROL: via the update_board tool's optional "design" object you set the look:
- theme (a full preset): ${themeList}
- bg / text / accent: custom colors (hex or CSS gradient) that override the theme
- heading / body fonts: ${FONT_KEYS.join(", ")}
- frame: ${FRAMES.join(", ")}
Design guidance:
- Keep it CONSISTENT by default — if the owner only changes content, OMIT "design" so the look stays the same.
- When they want a new look ("make it fancier", "change the colors", "match this photo"), pick a fitting theme and/or custom colors/fonts. Be tasteful and bold when asked.
- Quality control is on you: always ensure high contrast (light text on dark bg or dark text on light bg) so it's readable across a restaurant. Don't put light text on a light background.
- You can tie the design to the occasion (e.g. festive theme near a holiday, coastal for a seafood night).

TOOL — update_board: call it ONLY when the owner wants to create or change the board (content and/or design). Return the COMPLETE board, carrying over anything unchanged. For anything that isn't a board change (questions, ideas, chit-chat), just reply with text and do NOT call the tool. Every change is shown to the owner as a proof to approve, so propose confidently.

REFERENCE PHOTOS: the owner may send images. Infer why from their words + the image.
- A photo of a COMPLETE specials board/list → REPLACE the entire board with EXACTLY what the photo shows. Do NOT keep or merge items from the previous board — start fresh from the photo. Transcribe every item and price precisely.
- A dish or style photo → use it to inform naming, wording, colors, or which theme best matches the vibe.
- To make the board LOOK like a reference photo, pick the closest theme and tune colors/fonts/frame. A dark wood-framed chalkboard with cream handwriting and blue accents → theme "chalkboard".
- If you truly can't tell what they want, ask one short clarifying question.

CONTENT RULES: prices are plain numbers, no symbols. NEVER invent or guess a price, and NEVER write placeholders like "<UNKNOWN>", "TBD", or "$0" — if a price isn't given or legible, leave it blank ("").

LEARNED PREFERENCES (built from the owner's past approvals & rejections — follow these by default unless this request says otherwise):
${prefs && prefs.trim() ? prefs.trim() : "(none yet — you'll learn the owner's taste as they approve and reject proofs)"}

CONTEXT
- Restaurant: ${RESTAURANT_NAME}
- Date: ${dateStr}. ${holidayLine} ${upcoming}
- Current design: ${describeDesign(currentBoard.design)}
- Current board content:
${JSON.stringify({ featured: currentBoard.featured, entrees: currentBoard.entrees, sides: currentBoard.sides, soups: currentBoard.soups }, null, 2)}

Keep replies short and friendly — this is Slack. When you change the board, add a one-line note about what you changed (content and/or look).`;
}

// Conversational, multimodal turn. history = [{role, content:string}], images = [{media_type, data(base64)}].
// Returns { reply, boardUpdate }. boardUpdate is set only if Claude chose to change the board.
export async function aiAgent({ history = [], userText = "", images = [], currentBoard, dateStr, holiday, prefs = "" }) {
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
      system: agentSystem(currentBoard, dateStr, holiday, prefs),
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
