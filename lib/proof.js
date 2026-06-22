// The proof workflow: turn an instruction into a draft + Slack proof,
// and publish an approved draft to the live board.

import { getSpecial, setSpecial, getDraft, setDraft, clearDraft, kvGet, kvSet } from "./store";
import { normalizeSpecial, buildCaption, todayInCentral, SAMPLE_SPECIAL } from "./menu";
import { getHolidayInfo } from "./holidays";
import { aiEditBoard, aiAgent } from "./ai";
import { generateImage, geminiConfigured } from "./gemini";
import { uploadImage, blobConfigured } from "./images";
import { getHistory, appendHistory } from "./conversation";
import { getPrefs } from "./learning";
import { proofBlocks, postProof, postText } from "./slackapi";

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

// Generate a full hand-drawn AI chalkboard image of the given menu (content-locked),
// matching the saved house-style reference. Returns a public image URL.
async function generateFullBoardImage(menu, attachedImages = []) {
  const featLine = menu.featured?.name
    ? `${menu.featured.name}${menu.featured.price ? ` — $${menu.featured.price}` : ""}`
    : "(none)";
  const entreeLines = (menu.entrees || []).map(
    (e, i) => `${i + 1}. ${e.name}${e.price ? ` — $${e.price}` : ""}${e.note ? ` (${e.note})` : ""}`
  );

  let refs = attachedImages;
  if (!refs.length) {
    const saved = await kvGet("style:reference");
    if (saved?.data) refs = [saved];
  }
  if (attachedImages.length) await kvSet("style:reference", attachedImages[0]);

  const prompt = `Create a PORTRAIT restaurant daily-specials chalkboard. It MUST contain EVERY line below — do not omit, add, rename, reorder, or re-price anything. Spell everything exactly.

FEATURED (large title at the very top): ${featLine}

ENTRÉES — include ALL ${entreeLines.length} of these, in order:
${entreeLines.join("\n")}

SIDES: ${(menu.sides || []).join(", ") || "(none)"}
SOUPS: ${(menu.soups || []).join(", ") || "(none)"}

Show each item's name on the left and its price ONCE on the right — never repeat a price. Before finishing, COUNT the entrées in your image — there must be exactly ${entreeLines.length}, plus the featured title. ${refs.length ? "Match the provided reference image's style as closely as possible: wood frame, colored chalk lettering, decorative flourishes, dotted dividers." : "Style: realistic wood-framed black chalkboard, colored chalk lettering, decorative flourishes, dotted dividers."}`;

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

  const rev = (continueFromDraft && prev?.rev ? prev.rev : 0) + 1;
  // Keep the existing look unless the edit explicitly changed it.
  const draft = { ...menu, design: menu.design || current?.design || null, rev, channel };
  await setDraft(draft);

  const imageUrl = `${baseUrl()}/api/og?draft=1&rev=${rev}`;
  const caption = buildCaption(normalizeSpecial(draft), getHolidayInfo());
  const preview = "*Caption preview:*\n" + caption.split("\n").slice(0, 5).join("\n") + " …";

  await postProof(channel, proofBlocks({
    imageUrl,
    headline: "🧾 *Proof for today's board* — review below, then Approve or Reject.",
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

  const { reply, boardUpdate, imageGen } = await aiAgent({
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

  if (imageGen && (!geminiConfigured() || !blobConfigured())) {
    await postText(
      channel,
      "⚠️ AI image generation isn't set up yet (needs the Gemini key + image storage). I can still update the board with the built-in designs — want me to do that instead?",
      replyTs
    );
    await appendHistory(convoKey, text, "[AI image gen not configured]");
    return;
  }

  if (imageGen) {
    const prev = await getDraft();
    const rev = ((prev && prev.rev) || 0) + 1;
    let draft;
    if (imageGen.mode === "full") {
      const url = await generateFullBoardImage(current, images);
      draft = { ...current, image: url, rev, channel, threadTs: replyTs };
    } else {
      const { data, mimeType } = await generateImage({
        prompt: `${imageGen.prompt}. Render a realistic restaurant chalkboard: a black slate board inside a wooden picture frame, with tasteful decorative chalk flourishes and borders around the EDGES only. Leave the large CENTER clean, dark, and empty so menu text can be placed on top afterward. Portrait orientation. Absolutely NO text, words, letters, or numbers anywhere in the image.`,
        references: images,
      });
      const url = await uploadImage(data, mimeType);
      const design = {
        ...(current.design || {}),
        bgImage: url,
        text: imageGen.textColor || current.design?.text,
        accent: imageGen.accentColor || current.design?.accent,
        frame: "none",
      };
      draft = { ...current, image: null, design, rev, channel, threadTs: replyTs };
    }
    await setDraft(draft);

    const imageUrl = `${baseUrl()}/api/og?draft=1&rev=${rev}`;
    await postProof(
      channel,
      proofBlocks({
        imageUrl,
        headline: reply || "🎨 Here's your AI design — review, then Approve or Reject.",
        captionPreview: "",
      }),
      reply || "AI board proof",
      replyTs
    );
    assistantSummary = (reply ? reply + "\n" : "") + "[generated an AI image proof]";
    await appendHistory(convoKey, images.length ? `${text || ""} [sent ${images.length} image(s)]`.trim() : text, assistantSummary);
    return;
  }

  if (boardUpdate) {
    const prev = await getDraft();
    const rev = ((prev && prev.rev) || 0) + 1;
    // DEFAULT: render the new content as a hand-drawn AI chalkboard (the owner's
    // preferred look). Fall back to the clean template only if explicitly requested
    // (cleanText) or if image generation isn't configured.
    const useAI = !boardUpdate.cleanText && geminiConfigured() && blobConfigured();
    let draft;
    if (useAI) {
      const url = await generateFullBoardImage(boardUpdate, images);
      draft = { ...boardUpdate, image: url, design: boardUpdate.design || current.design || null, rev, channel, threadTs: replyTs };
    } else {
      draft = { ...boardUpdate, image: null, design: boardUpdate.design || current.design || null, rev, channel, threadTs: replyTs };
    }
    await setDraft(draft);

    const imageUrl = `${baseUrl()}/api/og?draft=1&rev=${rev}`;
    await postProof(
      channel,
      proofBlocks({
        imageUrl,
        headline: reply || (useAI ? "🎨 Here's your board — review, then Approve or Reject." : "🧾 Here's an updated proof — review, then Approve or Reject."),
        captionPreview: "",
      }),
      reply || "Board proof",
      replyTs
    );
    assistantSummary = (reply ? reply + "\n" : "") + "[posted a board proof for approval]";
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
  return s;
}
