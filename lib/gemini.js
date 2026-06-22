// Image generation via the Gemini API (gemini-2.5-flash-image / "Nano Banana").
// Used for AI backgrounds (hybrid mode) and full AI-generated boards.

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

// prompt: string. references: [{ media_type, data(base64) }] — optional input images
// (e.g. the owner's reference photo) for style-matching / image editing.
// Returns { data: Buffer, mimeType }.
export async function generateImage({ prompt, references = [] }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const parts = [{ text: prompt }];
  for (const r of references.slice(0, 4)) {
    if (r?.data) parts.push({ inline_data: { mime_type: r.media_type || "image/png", data: r.data } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts2 = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts2.find((p) => p.inline_data || p.inlineData);
  const inline = imgPart?.inline_data || imgPart?.inlineData;
  if (!inline?.data) throw new Error("Gemini returned no image");
  return {
    data: Buffer.from(inline.data, "base64"),
    mimeType: inline.mime_type || inline.mimeType || "image/png",
  };
}
