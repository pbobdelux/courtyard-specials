import crypto from "crypto";
import { after } from "next/server";
import { getSpecial, getDraft, kvGet, kvSet } from "@/lib/store";
import { normalizeSpecial, todayInCentral, RESTAURANT_NAME } from "@/lib/menu";
import { aiConfigured } from "@/lib/ai";
import { generateProof, publishDraft, runAgentTurn } from "@/lib/proof";
import { downloadSlackFile } from "@/lib/slackapi";

export const dynamic = "force-dynamic";

// ---- Slack request signature verification ----
function verifySlack(req, raw) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // dev: allow
  const ts = req.headers.get("x-slack-request-timestamp");
  const sig = req.headers.get("x-slack-signature");
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay guard
  const base = `v0:${ts}:${raw}`;
  const mine = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
  } catch {
    return false;
  }
}

const ok = (textOrJson) =>
  typeof textOrJson === "string"
    ? new Response(textOrJson, { status: 200 })
    : Response.json(textOrJson);

function liveBoardText(s) {
  const lines = [];
  if (s.featured?.name)
    lines.push(`*${s.featured.name}*${s.featured.price ? ` — $${s.featured.price}` : ""}`);
  for (const e of s.entrees)
    lines.push(`• ${e.name}${e.price ? ` — $${e.price}` : ""}${e.note ? ` (_${e.note}_)` : ""}`);
  if (s.sides?.length) lines.push(`\n_Sides:_ ${s.sides.join(", ")}`);
  if (s.soups?.length) lines.push(`_Soup:_ ${s.soups.join(", ")}`);
  return lines.join("\n");
}

function showResponse(s) {
  const status = s.postedDate
    ? "✅ Posted today."
    : s.approved && s.approvedDate === todayInCentral()
      ? "✅ Approved — posts at 2 PM Central."
      : "On the board now.";
  return ok({
    response_type: "ephemeral",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${RESTAURANT_NAME} — Live Board*\n${status}` } },
      { type: "section", text: { type: "mrkdwn", text: liveBoardText(s) || "_empty_" } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Type a change to get a proof, e.g. `/special add a ribeye at 29 and remove the porterhouse`",
          },
        ],
      },
    ],
  });
}

export async function POST(req) {
  const raw = await req.text();
  if (!verifySlack(req, raw)) return new Response("bad signature", { status: 401 });

  const contentType = req.headers.get("content-type") || "";

  // ---- Events API (channel @mentions) + URL verification ----
  if (contentType.includes("application/json")) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("bad json", { status: 400 });
    }

    if (body.type === "url_verification") {
      return new Response(body.challenge, { status: 200 });
    }

    if (body.type === "event_callback") {
      const ev = body.event || {};

      // De-dupe: Slack retries events; only process each event id once.
      if (body.event_id) {
        const seen = await kvGet(`evt:${body.event_id}`);
        if (seen) return new Response("", { status: 200 });
        await kvSet(`evt:${body.event_id}`, 1);
      }

      // @mention → full conversational agent (text + any photos, with thread memory).
      if (ev.type === "app_mention" && !ev.bot_id) {
        const text = (ev.text || "").replace(/<@[^>]+>/g, "").trim();
        const channel = ev.channel;
        const threadTs = ev.thread_ts || ev.ts;
        const imageFiles = (ev.files || []).filter((f) =>
          (f.mimetype || "").startsWith("image/")
        );
        after(async () => {
          try {
            const images = [];
            for (const f of imageFiles.slice(0, 4)) {
              const data = await downloadSlackFile(f.url_private_download || f.url_private);
              if (data) images.push({ media_type: f.mimetype, data });
            }
            await runAgentTurn({ text, images, channel, threadTs });
          } catch (e) {
            console.error("agent turn failed:", e.message);
          }
        });
      }
      return new Response("", { status: 200 }); // ack within 3s
    }

    return new Response("", { status: 200 });
  }

  // ---- Slash commands + interactivity (form-encoded) ----
  const params = new URLSearchParams(raw);

  // Interactivity: button clicks and modal submits
  const payloadStr = params.get("payload");
  if (payloadStr) {
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return new Response("bad payload", { status: 400 });
    }

    if (payload.type === "block_actions") {
      const action = payload.actions?.[0]?.action_id;
      const responseUrl = payload.response_url;

      if (action === "approve_proof") {
        const s = await publishDraft();
        after(async () => {
          await fetch(responseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              replace_original: true,
              text: s
                ? "✅ *Approved!* The board is updated now. It posts to Instagram & Facebook at 2:00 PM Central."
                : "⚠️ Nothing to approve — that proof may have already been handled.",
            }),
          });
        });
        return new Response("", { status: 200 });
      }

      if (action === "reject_proof") {
        // Open the feedback popup (needs the trigger_id, valid ~3s).
        const { openFeedbackModal } = await import("@/lib/slackapi");
        await openFeedbackModal(payload.trigger_id);
        return new Response("", { status: 200 });
      }

      return new Response("", { status: 200 });
    }

    if (payload.type === "view_submission" && payload.view?.callback_id === "reject_feedback") {
      const feedback = payload.view.state?.values?.fb?.text?.value?.trim();
      const draft = await getDraft();
      const channel = draft?.channel;
      if (feedback && channel) {
        after(async () => {
          try {
            await generateProof({ instruction: feedback, channel, continueFromDraft: true });
          } catch (e) {
            console.error("feedback revision failed:", e.message);
          }
        });
      }
      return new Response("", { status: 200 }); // closes the modal
    }

    return new Response("", { status: 200 });
  }

  // Slash command: /special [text]
  const text = (params.get("text") || "").trim();
  const channel = params.get("channel_id");

  if (text === "" || text === "show") {
    const stored = await getSpecial();
    return showResponse(normalizeSpecial(stored || {}));
  }

  if (text === "approve") {
    const s = await publishDraft();
    return ok({
      response_type: "ephemeral",
      text: s
        ? "✅ Approved! Board updated; posts to Instagram & Facebook at 2:00 PM Central."
        : "⚠️ No pending proof to approve. Type a change first.",
    });
  }

  // Anything else = a plain-English edit → build a proof.
  if (!aiConfigured()) {
    return ok({
      response_type: "ephemeral",
      text: "⚠️ AI editing isn't configured yet (missing ANTHROPIC_API_KEY).",
    });
  }
  after(async () => {
    try {
      await generateProof({ instruction: text, channel });
    } catch (e) {
      console.error("slash proof failed:", e.message);
    }
  });
  return ok({
    response_type: "ephemeral",
    text: "🎨 Building your proof… I'll drop it in this channel in a few seconds.",
  });
}
