import { getSpecial } from "@/lib/store";
import { SAMPLE_SPECIAL, normalizeSpecial } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const stored = await getSpecial();
  const special = { ...normalizeSpecial(stored || SAMPLE_SPECIAL), holiday: getHolidayInfo() };
  return <BoardClient initial={special} />;
}
