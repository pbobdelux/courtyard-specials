// The proof workflow: turn an instruction into a draft + Slack proof,
// and publish an approved draft to the live board.

import { getSpecial, setSpecial, getDraft, setDraft, clearDraft, kvGet, kvSet } from "./store";
import { normalizeSpecial, buildCaption, todayInCentral, SAMPLE_SPECIAL } from "./menu";
import { getHolidayInfo } from "./holidays";
import { aiEditBoard, aiAgent } from "./ai";
import { generateImage, geminiConfigured } from "./gemini";
import { uploadImage, blobConfigured } from "./images";
import { getHistory, appendHistory, clearHistory } from "./conversation";
import { getPrefs } from "./learning";
import { proofBlocks, postProof, postText } from "./slackapi";

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

// Generate a full hand-drawn AI chalkboard image of the given menu (content-locked).
// Returns a public image URL.
// NOTE: we intentionally do NOT reuse a persisted "style reference" image — a saved
// board image carries old TEXT/items that the model copies, bleeding stale content
// into new boards. We rely on the strong style description below instead. Only a photo
// attached in the SAME message is used (style-only), with explicit "ignore the text".
async function generateFullBoardImage(menu, attachedImages = []) {
  const featLine = menu.featured?.name
    ? `${menu.featured.name}${menu.featured.price ? ` — $${menu.featured.price}` : ""}`
    : "(none)";
  const entreeLines = (menu.entrees || []).map(
    (e, i) => `${i + 1}. ${e.name}${e.price ? ` — $${e.price}` : ""}${e.note ? ` (${e.note})` : ""}`
  );

  const refs = attachedImages; // current-message attachment only; never a persisted reference

  const prompt = `Create a PORTRAIT restaurant daily-specials chalkboard. It MUST contain EVERY line below — do not omit, add, rename, reorder, or re-price anything. Use ONLY these items; do not invent or carry over any other items. Spell everything exactly.

FEATURED (large title at the very top): ${featLine}

ENTRÉES — include ALL ${entreeLines.length} of these, in order:
${entreeLines.join("\n")}

SIDES: ${(menu.sides || []).join(", ") || "(none)"}
SOUPS: ${(menu.soups || []).join(", ") || "(none)"}

Show each item's name on the left and its price ONCE on the right — never repeat a price. Before finishing, COUNT the entrées in your image — there must be exactly ${entreeLines.length}, plus the featured title.

FRAMING (important): a flat, WALL-MOUNTED rectangular wooden picture frame directly around a SINGLE black chalkboard that completely fills the inside of the frame. NO easel, NO stand or tripod, NO inner border/box/outline/extra margin around the text — just the wooden frame around the full chalkboard, shown straight-on. ${refs.length ? "Match the attached image's visual STYLE only (hand-drawn colored chalk, flourishes, dotted dividers, botanical sprigs in the bottom corners) — IGNORE any text/items in it; the menu is exactly the list above." : "Hand-lettered chalk: a colored title, cream item names with a few tasteful color accents, small decorative flourishes, dotted divider lines, and simple botanical sprigs in the bottom corners."}`;

  const { data, mimeType } = await generateImage({ prompt, references: refs });
  return await uploadImage(data, mimeType);
}

// Apply an instruction and post an image proof to the Slack channel.
// A fresh edit (slash / @mention) starts from the LIVE board; a feedback
// revision (continueFromDraft) builds on the in-progress draft instead.
export async function generateProof({ instruction, channel, continueFromDraft = false }) {
  const prev = await getDraft();
  const current = continueFromDraft ? prev || (await getSpecial()) : await getSpecial();
  const menu = await aiEditBoard({ current, instruction });

  // Always a real AI image — never a flat template proof.
  if (!geminiConfigured() || !blobConfigured()) {
    await postText(channel, "⚠️ Can't build the board right now — image generation isn't set up.");
    return null;
  }
  let image;
  try {
    image = await generateFullBoardImage(menu);
  } catch (e) {
    console.error("generateProof image failed:", e.message);
    await postText(channel, "⚠️ The board image didn't generate that time — try again and I'll remake it.");
    return null;
  }

  const rev = (continueFromDraft && prev?.rev ? prev.rev : 0) + 1;
  const draft = { ...menu, image, design: menu.design || current?.design || null, rev, channel };
  await setDraft(draft);

  const caption = buildCaption(normalizeSpecial(draft), getHolidayInfo());
  const preview = "*Caption preview:*\n" + caption.split("\n").slice(0, 5).join("\n") + " …";

  await postProof(channel, proofBlocks({
    // Unique image URL → Slack can't serve a cached old image.
    imageUrl: image,
    headline: "🧾 *Proof for today's board* — review below, then Accept, Reject, or Post to Social.",
    captionPreview: preview,
  }));

  return draft;
}

// Conversational turn: the owner talks to the bot (DM or @mention, optionally with
// photos). Claude decides whether to just chat or to update the board (→ proof).
// convoKey = memory bucket; replyTs = thread to reply in (undefined for a DM).
export async function runAgentTurn({ text, images = [], channel, convoKey, replyTs }) {
  const current = normalizeSpecial((await getSpecial()) || SAMPLE_SPECIAL);
  const history = await getHistory(convoKey);
  const prefs = await getPrefs();

  const { reply, boardUpdate } = await aiAgent({
    history,
    userText: text,
    images,
    prefs,
    currentBoard: {
      featured: current.featured,
      entrees: current.entrees,
      sides: current.sides,
      soups: current.soups,
      design: current.design,
    },
    dateStr: todayInCentral(),
    holiday: getHolidayInfo(),
  });

  let assistantSummary = reply;

  if (boardUpdate) {
    // A board proof is ALWAYS a real AI image. If we can't make one, we post a
    // plain-text "try again" — NEVER a flat template proof.
    if (!geminiConfigured() || !blobConfigured()) {
      await postText(channel, "⚠️ I can't make the board right now — image generation isn't set up. No board was posted.", replyTs);
      assistantSummary = (reply ? reply + "\n" : "") + "[image generation not configured — no proof]";
    } else {
      let url;
      try {
        url = await generateFullBoardImage(boardUpdate, images);
      } catch (e) {
        console.error("board image generation failed:", e.message);
        await postText(channel, "⚠️ The board image didn't generate that time — say \"try again\" and I'll remake it.", replyTs);
        await appendHistory(convoKey, images.length ? `${text || ""} [sent ${images.length} image(s)]`.trim() : text, "[image generation failed — no proof]");
        return;
      }
      const prev = await getDraft();
      const rev = ((prev && prev.rev) || 0) + 1;
      const draft = { ...boardUpdate, image: url, design: boardUpdate.design || current.design || null, rev, channel, threadTs: replyTs };
      await setDraft(draft);
      await postProof(
        channel,
        proofBlocks({
          // Point at the board's UNIQUE image URL so Slack never serves a cached old image.
          imageUrl: url,
          headline: reply || "🎨 Here's your board — review, then Accept, Reject, or Post to Social.",
          captionPreview: "",
        }),
        reply || "Board proof",
        replyTs
      );
      assistantSummary = (reply ? reply + "\n" : "") + "[posted a board proof for approval]";
    }
  } else {
    await postText(channel, reply || "🤔 (no response)", replyTs);
  }

  await appendHistory(convoKey, images.length ? `${text || ""} [sent ${images.length} image(s)]`.trim() : text, assistantSummary);
}

// Promote the pending draft to the live board: board updates now,
// social posts at 2 PM Central via the existing Make.com flow.
export async function publishDraft() {
  const draft = await getDraft();
  if (!draft) return null;
  const s = normalizeSpecial(draft);
  s.approved = true;
  s.approvedDate = todayInCentral();
  s.postedDate = null;
  await setSpecial(s);
  await clearDraft();
  // Wipe the chat memory for this channel so the next board starts clean from
  // the (now published) live board, not from old conversation items.
  if (draft.channel) {
    await clearHistory(`ch:${draft.channel}`);
    await clearHistory(`dm:${draft.channel}`);
  }
  return s;
}

// Publish the draft to the board AND post it to Instagram/Facebook right now
// (via the Make.com webhook). Returns status so the bot can report back.
export async function publishAndPostSocial() {
  const s = await publishDraft();
  if (!s) return { published: false };

  const imageUrl = s.image || `${baseUrl()}/api/og`;
  const caption = buildCaption(s, getHolidayInfo());
  const hook = process.env.MAKE_WEBHOOK_URL;
  let posted = false;
  if (hook) {
    try {
      const r = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl, caption }),
      });
      posted = r.ok;
    } catch {
      /* posted stays false */
    }
    // Mark posted so the scheduled 2 PM job doesn't post it again.
    const live = normalizeSpecial(await getSpecial());
    if (live) {
      live.postedDate = todayInCentral();
      await setSpecial(live);
    }
  }
  return { published: true, posted, hookConfigured: !!hook };
}
