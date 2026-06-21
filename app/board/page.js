import { getSpecial } from "@/lib/store";
import { SAMPLE_SPECIAL, normalizeSpecial } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }) {
  const stored = await getSpecial();
  const special = { ...normalizeSpecial(stored || SAMPLE_SPECIAL), holiday: getHolidayInfo() };
  // ?rotate=90 or 270 — for TVs whose browser outputs landscape but the panel
  // is physically turned 90°. CSS rotates the board to fill the screen upright.
  const sp = (await searchParams) || {};
  const rotate = sp.rotate === "90" || sp.rotate === "270" ? sp.rotate : null;
  return <BoardClient initial={special} rotate={rotate} />;
}
