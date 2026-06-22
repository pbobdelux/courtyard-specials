// Thin wrappers over the Slack Web API used by the proof loop.
// If SLACK_BOT_TOKEN is missing (e.g. local dev), these no-op so state logic
// can still be exercised without a live Slack workspace.

const BOT = () => process.env.SLACK_BOT_TOKEN || "";

async function slackCall(method, body) {
  const token = BOT();
  if (!token) {
    console.warn(`[slack] ${method} skipped — no SLACK_BOT_TOKEN`);
    return null;
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`[slack] ${method} failed:`, data.error);
  return data;
}

export function proofBlocks({ imageUrl, headline, captionPreview }) {
  return [
    { type: "section", text: { type: "mrkdwn", text: headline } },
    { type: "image", image_url: imageUrl, alt_text: "Specials board proof" },
    captionPreview
      ? { type: "context", elements: [{ type: "mrkdwn", text: captionPreview }] }
      : { type: "context", elements: [{ type: "mrkdwn", text: " " }] },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "✅ Accept" },
          action_id: "approve_proof",
        },
        {
          type: "button",
          style: "danger",
          text: { type: "plain_text", text: "✏️ Reject" },
          action_id: "reject_proof",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "📲 Post to Social" },
          action_id: "post_social",
        },
      ],
    },
  ];
}

export function postProof(channel, blocks, text = "Specials board proof", thread_ts) {
  return slackCall("chat.postMessage", { channel, blocks, text, ...(thread_ts ? { thread_ts } : {}) });
}

export function updateMessage(channel, ts, text, blocks) {
  return slackCall("chat.update", { channel, ts, text, blocks: blocks || [] });
}

export function postText(channel, text, thread_ts) {
  return slackCall("chat.postMessage", { channel, text, ...(thread_ts ? { thread_ts } : {}) });
}

// Download a Slack-hosted file (url_private) as base64 — needs the bot token + files:read.
export async function downloadSlackFile(url) {
  const token = BOT();
  if (!token || !url) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

// Opens the "what should change?" feedback popup after a Reject click.
export function openFeedbackModal(trigger_id) {
  return slackCall("views.open", {
    trigger_id,
    view: {
      type: "modal",
      callback_id: "reject_feedback",
      title: { type: "plain_text", text: "Revise the proof" },
      submit: { type: "plain_text", text: "Send new proof" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "fb",
          label: { type: "plain_text", text: "What should change?" },
          element: {
            type: "plain_text_input",
            action_id: "text",
            multiline: true,
            placeholder: {
              type: "plain_text",
              text: "e.g. drop the price to 32, add a Father's Day note, remove the cod",
            },
          },
        },
      ],
    },
  });
}
