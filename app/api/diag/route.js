import { generateImage, geminiConfigured } from "@/lib/gemini";
import { uploadImage, blobConfigured } from "@/lib/images";

export const dynamic = "force-dynamic";

// TEMP diagnostic: checks Gemini + Blob end to end. Protected by MAKE_TOKEN.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (process.env.MAKE_TOKEN && token !== process.env.MAKE_TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }
  const out = {
    geminiConfigured: geminiConfigured(),
    blobConfigured: blobConfigured(),
    hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    hasBlobStoreId: !!process.env.BLOB_STORE_ID,
  };

  // Test Blob upload with a 1x1 PNG.
  try {
    const tiny = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000001e221bc330000000049454e44ae426082",
      "hex"
    );
    out.blobUrl = await uploadImage(tiny, "image/png");
  } catch (e) {
    out.blobError = String(e?.message || e).slice(0, 300);
  }

  // Test Gemini image generation.
  try {
    const { data } = await generateImage({ prompt: "a small solid red circle centered on a white background" });
    out.geminiBytes = data.length;
  } catch (e) {
    out.geminiError = String(e?.message || e).slice(0, 300);
  }

  return Response.json(out);
}
