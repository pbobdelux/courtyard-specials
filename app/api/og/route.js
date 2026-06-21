import { ImageResponse } from "next/og";
import { getSpecial, getDraft } from "@/lib/store";
import { SAMPLE_SPECIAL, normalizeSpecial, RESTAURANT_NAME } from "@/lib/menu";
import { getHolidayInfo } from "@/lib/holidays";

export const dynamic = "force-dynamic";

const BOARD = "#14130f";
const CREAM = "#efe9d6";
const BLUE = "#8fc7e3";

const h = (type, props, ...children) => ({
  type,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
});

async function loadFont() {
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/PatrickHand-Regular.ttf"
    );
    if (res.ok) return await res.arrayBuffer();
  } catch {
    /* fall through */
  }
  return null;
}

// 1080x1080 square image for Instagram + Facebook.
// ?draft=1 renders the pending draft (used for Slack proofs) instead of the live board.
export async function GET(req) {
  const wantDraft = new URL(req.url).searchParams.get("draft");
  const stored = wantDraft ? (await getDraft()) || (await getSpecial()) : await getSpecial();
  const s = normalizeSpecial(stored || SAMPLE_SPECIAL);
  const holiday = getHolidayInfo();
  const font = await loadFont();

  const entreeRows = s.entrees.map((e) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", marginBottom: 14 } },
      h(
        "div",
        { style: { display: "flex", alignItems: "baseline", width: "100%" } },
        h("div", { style: { fontSize: 50, color: CREAM } }, e.name),
        h("div", { style: { flex: 1 } }),
        e.price ? h("div", { style: { fontSize: 50, color: CREAM } }, `$${e.price}`) : h("div", {})
      ),
      e.note
        ? h("div", { style: { fontSize: 24, color: BLUE, marginTop: -2 } }, `* ${e.note}`)
        : h("div", {})
    )
  );

  const column = (label, items) =>
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 } },
      h("div", { style: { fontSize: 44, color: BLUE, marginBottom: 6 } }, label),
      ...items.map((x) => h("div", { style: { fontSize: 32, color: CREAM } }, x))
    );

  const element = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BOARD,
        padding: "70px 80px",
        fontFamily: "Hand",
      },
    },
    // Holiday banner (text only — keeps the image font clean)
    holiday?.today
      ? h(
          "div",
          { style: { display: "flex", justifyContent: "center", fontSize: 40, color: CREAM, marginBottom: 12 } },
          holiday.today.greeting
        )
      : h("div", {}),
    // Featured header
    h(
      "div",
      { style: { display: "flex", justifyContent: "center", alignItems: "baseline", gap: 20 } },
      h("div", { style: { fontSize: 78, color: BLUE } }, s.featured?.name || RESTAURANT_NAME),
      s.featured?.price ? h("div", { style: { fontSize: 64, color: BLUE } }, `$${s.featured.price}`) : h("div", {})
    ),
    h("div", { style: { height: 3, background: BLUE, opacity: 0.7, margin: "24px 0 30px" } }),
    // Entrees
    h("div", { style: { display: "flex", flexDirection: "column", flex: 1 } }, ...entreeRows),
    // Sides / Soup
    s.sides.length || s.soups.length
      ? h(
          "div",
          {
            style: {
              display: "flex",
              borderTop: `2px solid ${BLUE}`,
              paddingTop: 26,
              marginTop: 10,
            },
          },
          column("Sides", s.sides),
          column("Soup", s.soups)
        )
      : h("div", {})
  );

  return new ImageResponse(element, {
    width: 1080,
    height: 1080,
    fonts: font ? [{ name: "Hand", data: font, style: "normal", weight: 400 }] : undefined,
  });
}
