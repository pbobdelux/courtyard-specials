import { getSpecial, setSpecial } from "@/lib/store";
import { normalizeSpecial, todayInCentral } from "@/lib/menu";
import { checkMakeToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Called by Make.com after it successfully posts, so we never double-post.
export async function POST(req) {
  if (!checkMakeToken(req)) return new Response("Unauthorized", { status: 401 });
  const stored = await getSpecial();
  if (stored) {
    const s = normalizeSpecial(stored);
    s.postedDate = todayInCentral();
    await setSpecial(s);
  }
  return Response.json({ ok: true });
}
