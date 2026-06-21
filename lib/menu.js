// Shared menu model, helpers, and the sample board (from the photo).

export const RESTAURANT_NAME = process.env.RESTAURANT_NAME || "Courtyard";

export const SAMPLE_SPECIAL = {
  date: null,
  featured: { name: "Fried Cauliflower", price: "11" },
  entrees: [
    { name: "Prime Rib", price: "34", note: "" },
    { name: "Bourbon Glazed Chop", price: "19", note: "" },
    { name: "Broiled Orange Roughy", price: "23", note: "" },
    { name: "Seafood Platter", price: "24", note: "Salmon, Cod, Shrimp" },
    { name: "Nashville Hot George", price: "19", note: "" },
    { name: "24oz Porterhouse", price: "38", note: "" },
  ],
  sides: ["Green Beans"],
  soups: ["French Onion", "Cheesy Broccoli"],
  approved: false,
  approvedDate: null,
  postedDate: null,
};

// Today's date as YYYY-MM-DD in US Central time (handles CST/CDT automatically).
export function todayInCentral() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function splitList(str) {
  return String(str)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Force any incoming data into a clean, predictable shape.
export function normalizeSpecial(input = {}) {
  const s = input || {};
  return {
    date: s.date || todayInCentral(),
    featured: {
      name: (s.featured?.name || "").trim(),
      price: String(s.featured?.price ?? "").trim(),
    },
    entrees: (Array.isArray(s.entrees) ? s.entrees : [])
      .map((e) => ({
        name: (e?.name || "").trim(),
        price: String(e?.price ?? "").trim(),
        note: (e?.note || "").trim(),
      }))
      .filter((e) => e.name),
    sides: Array.isArray(s.sides) ? s.sides.filter(Boolean) : splitList(s.sides || ""),
    soups: Array.isArray(s.soups) ? s.soups.filter(Boolean) : splitList(s.soups || ""),
    design: s.design && typeof s.design === "object" ? s.design : null,
    approved: !!s.approved,
    approvedDate: s.approvedDate || null,
    postedDate: s.postedDate || null,
  };
}

// Build the Instagram / Facebook caption from the special.
// `holiday` is the optional { today, upcoming } object from lib/holidays.
export function buildCaption(s, holiday) {
  const lines = [];
  lines.push(`🍽️ Tonight's Specials at ${RESTAURANT_NAME}`);
  if (holiday?.today) {
    lines.push(`${holiday.today.emoji} ${holiday.today.greeting}`);
  }
  lines.push("");
  if (s.featured?.name) {
    lines.push(`✨ ${s.featured.name}${s.featured.price ? ` — $${s.featured.price}` : ""}`);
    lines.push("");
  }
  for (const e of s.entrees) {
    lines.push(`• ${e.name}${e.price ? ` — $${e.price}` : ""}${e.note ? ` (${e.note})` : ""}`);
  }
  if (s.sides?.length) lines.push(`\nSides: ${s.sides.join(", ")}`);
  if (s.soups?.length) lines.push(`Soup: ${s.soups.join(", ")}`);
  lines.push("");
  lines.push("Come join us tonight! 🍷");
  lines.push("#specials #dinner #foodie #eatlocal");
  return lines.join("\n");
}
