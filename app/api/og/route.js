import { ImageResponse } from "next/og";
import { getSpecial, getDraft } from "@/lib/store";
import { SAMPLE_SPECIAL, normalizeSpecial, RESTAURANT_NAME } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";
import { resolveDesign } from "@/lib/themes";

export const dynamic = "force-dynamic";

const h = (type, props, ...children) => ({
  type,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
});

async function loadFont(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.arrayBuffer();
  } catch {
    /* fall through */
  }
  return null;
}

const FRAME_MAP = (accent) => ({
  wood: { color: "#6b4421", pad: 30 },
  gold: { color: "#b8923f", pad: 24 },
  thin: { color: accent, pad: 10 },
  white: { color: "#ece7da", pad: 16 },
  none: { color: "transparent", pad: 0 },
});

// 1080x1080 square image for Instagram + Facebook.
// ?draft=1 renders the pending draft (used for Slack proofs) instead of the live board.
export async function GET(req) {
  const wantDraft = new URL(req.url).searchParams.get("draft");
  const stored = wantDraft ? (await getDraft()) || (await getSpecial()) : await getSpecial();
  const s = normalizeSpecial(stored || SAMPLE_SPECIAL);
  const holiday = getHolidayInfo();
  const d = resolveDesign(s.design);

  const [headingData, bodyData] = await Promise.all([loadFont(d.headingTtf), loadFont(d.bodyTtf)]);
  const fonts = [];
  if (headingData) fonts.push({ name: "Heading", data: headingData, style: "normal", weight: 400 });
  if (bodyData) fonts.push({ name: "Body", data: bodyData, style: "normal", weight: 400 });
  const headingFam = headingData ? "Heading" : "Body";
  const bodyFam = bodyData ? "Body" : "Heading";

  const { text, accent } = d;
  const isGradient = (d.bg || "").includes("gradient");
  const boardBg = isGradient ? { backgroundImage: d.bg } : { backgroundColor: d.bg };
  const frame = FRAME_MAP(accent)[d.frame] || FRAME_MAP(accent).wood;

  const entreeRows = s.entrees.map((e) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginBottom: 14 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", width: "100%" } },
        h("div", { style: { fontSize: 50, color: text, fontFamily: bodyFam } }, e.name),
        h("div", { style: { flex: 1 } }),
        e.price ? h("div", { style: { fontSize: 50, color: text, fontFamily: bodyFam } }, `$${e.price}`) : h("div", {})
      ),
      e.note
        ? h("div", { style: { fontSize: 24, color: accent, marginTop: -2, fontFamily: bodyFam } }, `* ${e.note}`)
        : h("div", {})
    )
  );

  const column = (label, items) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 } },
      h("div", { style: { fontSize: 46, color: accent, marginBottom: 6, fontFamily: headingFam } }, label),
      ...items.map((x) => h("div", { style: { fontSize: 32, color: text, fontFamily: bodyFam } }, x))
    );

  const board = h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        borderRadius: 18,
        padding: "58px 66px",
        ...boardBg,
      },
    },
    holiday?.today
      ? h(
          "div",
          { style: { display: "flex", justifyContent: "center", fontSize: 40, color: text, marginBottom: 12, fontFamily: headingFam } },
          holiday.today.greeting
        )
      : h("div", {}),
    h(
      "div",
      { style: { display: "flex", justifyContent: "center", alignItems: "baseline", gap: 20 } },
      h("div", { style: { fontSize: 80, color: accent, fontFamily: headingFam } }, s.featured?.name || RESTAURANT_NAME),
      s.featured?.price ? h("div", { style: { fontSize: 62, color: accent, fontFamily: headingFam } }, `$${s.featured.price}`) : h("div", {})
    ),
    h("div", { style: { height: 3, backgroundColor: accent, opacity: 0.7, margin: "24px 0 30px" } }),
    h("div", { style: { display: "flex", flexDirection: "column", flex: 1 } }, ...entreeRows),
    s.sides.length || s.soups.length
      ? h(
          "div",
          { style: { display: "flex", borderTop: `2px solid ${accent}`, paddingTop: 26, marginTop: 10 } },
          column("Sides", s.sides),
          column("Soup", s.soups)
        )
      : h("div", {})
  );

  const element = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        padding: frame.pad,
        backgroundColor: frame.color,
        fontFamily: bodyFam,
      },
    },
    board
  );

  return new ImageResponse(element, {
    width: 1080,
    height: 1080,
    fonts: fonts.length ? fonts : undefined,
  });
}
