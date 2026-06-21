// The proof workflow: turn an instruction into a draft + Slack proof,
// and publish an approved draft to the live board.

import { getSpecial, setSpecial, getDraft, setDraft, clearDraft } from "./store";
import { normalizeSpecial, buildCaption, todayInCentral, SAMPLE_SPECIAL } from "./menu";
import { getHolidayInfo } from "./holidays";
import { aiEditBoard, aiAgent } from "./ai";
import { getHistory, appendHistory } from "./conversation";
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

// Conversational turn: the owner @mentions the bot (optionally with photos) in a
// thread. Claude decides whether to just chat or to update the board (→ proof).
export async function runAgentTurn({ text, images = [], channel, threadTs }) {
  const current = normalizeSpecial((await getSpecial()) || SAMPLE_SPECIAL);
  const history = await getHistory(threadTs);

  const { reply, boardUpdate } = await aiAgent({
    history,
    userText: text,
    images,
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
    const prev = await getDraft();
    const rev = ((prev && prev.rev) || 0) + 1;
    // Keep the current look unless Claude explicitly restyled it.
    const draft = { ...boardUpdate, design: boardUpdate.design || current.design || null, rev, channel, threadTs };
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
      threadTs
    );
    assistantSummary = (reply ? reply + "\n" : "") + "[posted a board proof for approval]";
  } else {
    await postText(channel, reply || "🤔 (no response)", threadTs);
  }

  await appendHistory(threadTs, images.length ? `${text || ""} [sent ${images.length} image(s)]`.trim() : text, assistantSummary);
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
