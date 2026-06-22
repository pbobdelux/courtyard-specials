import { getStoredImage } from "@/lib/images";

export const dynamic = "force-dynamic";

// Serves a stored generated image publicly (used by the TV board, Slack, and social).
export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const img = await getStoredImage(id);
  if (!img?.b64) return new Response("not found", { status: 404 });
  const buf = Buffer.from(img.b64, "base64");
  return new Response(buf, {
    headers: {
      "content-type": img.ct || "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
