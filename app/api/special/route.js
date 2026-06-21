import { getSpecial, setSpecial } from "@/lib/store";
import { SAMPLE_SPECIAL, normalizeSpecial } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";
import { checkAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Public: the TV board and admin both read this.
// Holiday info is computed fresh on every read (it's date-based, not stored).
export async function GET() {
  const stored = await getSpecial();
  return Response.json({
    ...normalizeSpecial(stored || SAMPLE_SPECIAL),
    holiday: getHolidayInfo(),
  });
}

// Protected: save a new draft. Editing always resets approval so a stale
// special can never auto-post.
export async function POST(req) {
  if (!checkAuth(req)) return new Response("Unauthorized", { status: 401 });
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const next = normalizeSpecial(body);
  next.approved = false;
  next.approvedDate = null;
  next.postedDate = null;
  await setSpecial(next);
  return Response.json(next);
}
