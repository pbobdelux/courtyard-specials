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
      // Lock the exact content so the AI renders the REAL menu, not an invented one.
      const lines = [];
      if (current.featured?.name)
        lines.push(`Featured headline (top, highlighted): ${current.featured.name}${current.featured.price ? ` — $${current.featured.price}` : ""}`);
      for (const e of current.entrees)
        lines.push(`${e.name}${e.price ? ` — $${e.price}` : ""}${e.note ? ` (${e.note})` : ""}`);
      if (current.sides?.length) lines.push(`Sides: ${current.sides.join(", ")}`);
      if (current.soups?.length) lines.push(`Soups: ${current.soups.join(", ")}`);
      const exactMenu = lines.join("\n");

      // Use an attached photo as the style reference; else reuse the saved house style.
      let refs = images;
      if (!refs.length) {
        const saved = await kvGet("style:reference");
        if (saved?.data) refs = [saved];
      }
      if (images.length) await kvSet("style:reference", images[0]); // remember latest reference

      const fullPrompt = `${imageGen.prompt}

Create a restaurant daily-specials chalkboard, PORTRAIT orientation. Render EXACTLY this content, spelled exactly, prices aligned to the right. Do NOT add, remove, rename, reorder, or re-price any item:
${exactMenu}

${refs.length ? "Match the provided reference image as closely as possible — same wood frame, black chalkboard, hand-drawn chalk lettering, color accents, decorative flourishes and dividers." : "Style: a realistic wood-framed black chalkboard, hand-drawn chalk lettering, a colored title, cream item text, subtle flourishes and a dotted divider."} Re-read the list and make sure every word and price matches exactly.`;

      const { data, mimeType } = await generateImage({ prompt: fullPrompt, references: refs });
      const url = await uploadImage(data, mimeType);
      draft = { ...current, image: url, rev, channel, threadTs: replyTs };
    } else {
      const { data, mimeType } = await generateImage({
        prompt: `${imageGen.prompt}. High-resolution background art only — absolutely NO text, words, letters, or numbers anywhere in the image.`,
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
    // Keep the current look unless Claude explicitly restyled it.
    const draft = { ...boardUpdate, design: boardUpdate.design || current.design || null, rev, channel, threadTs: replyTs };
    await setDraft(draft);

    const imageUrl = `${baseUrl()}/api/og?draft=1&rev=${rev}`;
    await postProof(
      channel,
      proofBlocks({
        imageUrl,
        headline: reply || "🧾 Here's an updated proof — review, then Approve or Reject.",
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
