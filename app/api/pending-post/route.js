import { getSpecial } from "@/lib/store";
import { normalizeSpecial, buildCaption, todayInCentral } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";
import { checkMakeToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Called by Make.com daily at 2:00 PM Central.
// Returns ready=true ONLY if today's special was approved and not yet posted.
export async function GET(req) {
  if (!checkMakeToken(req)) return new Response("Unauthorized", { status: 401 });

  const stored = await getSpecial();
  const today = todayInCentral();
  const s = stored ? normalizeSpecial(stored) : null;

  const ready = !!(
    s &&
    s.approved &&
    s.approvedDate === today &&
    s.postedDate !== today
  );

  const url = new URL(req.url);
  const base = (process.env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");

  return Response.json({
    ready,
    date: today,
    caption: ready ? buildCaption(s, getHolidayInfo()) : "",
    // cache-busting param so each day fetches a fresh image
    imageUrl: ready ? `${base}/api/og?d=${today}` : "",
  });
}
