// The proof workflow: turn an instruction into a draft + Slack proof,
// and publish an approved draft to the live board.

import { getSpecial, setSpecial, getDraft, setDraft, clearDraft } from "./store";
import { normalizeSpecial, buildCaption, todayInCentral } from "./menu";
import { getHolidayInfo } from "./holidays";
import { aiEditBoard } from "./ai";
import { proofBlocks, postProof } from "./slackapi";

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
  const draft = { ...menu, rev, channel };
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
