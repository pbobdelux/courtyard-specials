import { getSpecial, setSpecial } from "@/lib/store";
import { normalizeSpecial, todayInCentral } from "@/lib/menu";
import { checkAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Protected: approve today's special so the 2 PM Make job will post it.
export async function POST(req) {
  if (!checkAuth(req)) return new Response("Unauthorized", { status: 401 });
  const stored = await getSpecial();
  if (!stored) return new Response("No special set yet", { status: 400 });
  const s = normalizeSpecial(stored);
  s.approved = true;
  s.approvedDate = todayInCentral();
  s.postedDate = null;
  await setSpecial(s);
  return Response.json(s);
}
