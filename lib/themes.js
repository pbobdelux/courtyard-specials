// The board's design system: curated fonts, frames, and themes that the AI can
// drive. Everything renders through the same solid template, so output stays
// readable and on-quality no matter what the AI picks.

// Fonts — all have static TTFs so the social-image renderer can load them too.
// `var` matches the CSS variable defined by next/font in app/layout.js.
const RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl";
export const FONTS = {
  casual: { var: "var(--font-casual)", ttf: `${RAW}/patrickhand/PatrickHand-Regular.ttf` },
  script: { var: "var(--font-script)", ttf: `${RAW}/lobster/Lobster-Regular.ttf` },
  fancy: { var: "var(--font-fancy)", ttf: `${RAW}/pacifico/Pacifico-Regular.ttf` },
  serif: { var: "var(--font-serif)", ttf: `${RAW}/dmserifdisplay/DMSerifDisplay-Regular.ttf` },
  condensed: { var: "var(--font-condensed)", ttf: `${RAW}/bebasneue/BebasNeue-Regular.ttf` },
  clean: { var: "var(--font-clean)", ttf: `${RAW}/poppins/Poppins-Regular.ttf` },
};

export const FONT_KEYS = Object.keys(FONTS);
export const FRAMES = ["wood", "gold", "thin", "white", "none"];

// Hand-tuned presets (each is contrast-checked to stay readable on a TV).
export const THEMES = {
  chalkboard: { label: "Classic chalkboard", bg: "#141310", text: "#efe9d6", accent: "#8fc7e3", heading: "script", body: "casual", frame: "wood" },
  classicwhite: { label: "Elegant white & gold", bg: "#f7f5f0", text: "#23211c", accent: "#b08428", heading: "serif", body: "clean", frame: "thin" },
  steakhouse: { label: "Warm steakhouse", bg: "linear-gradient(160deg,#241812,#0f0b08)", text: "#f1e7d3", accent: "#caa24a", heading: "serif", body: "clean", frame: "gold" },
  moderndark: { label: "Modern dark/mint", bg: "#0f1115", text: "#f2f4f8", accent: "#5fe3b0", heading: "condensed", body: "clean", frame: "none" },
  coastal: { label: "Coastal navy & sand", bg: "linear-gradient(160deg,#0c3d56,#0a2536)", text: "#eef6fb", accent: "#f4c95d", heading: "script", body: "clean", frame: "thin" },
  kraft: { label: "Rustic kraft paper", bg: "#c9ae86", text: "#2c2117", accent: "#7a4a25", heading: "casual", body: "clean", frame: "thin" },
  festive: { label: "Festive holiday", bg: "linear-gradient(160deg,#11281b,#0a1a12)", text: "#f3efe2", accent: "#e3b23c", heading: "script", body: "casual", frame: "gold" },
};

export const THEME_KEYS = Object.keys(THEMES);
export const DEFAULT_THEME = "chalkboard";

// Merge a (possibly partial) design with its theme preset into final tokens.
export function resolveDesign(design) {
  const d = design || {};
  const base = THEMES[d.theme] || THEMES[DEFAULT_THEME];
  const headingKey = d.heading && FONTS[d.heading] ? d.heading : base.heading;
  const bodyKey = d.body && FONTS[d.body] ? d.body : base.body;
  return {
    themeKey: THEMES[d.theme] ? d.theme : DEFAULT_THEME,
    bg: d.bg || base.bg,
    text: d.text || base.text,
    accent: d.accent || base.accent,
    headingKey,
    bodyKey,
    headingFont: FONTS[headingKey].var,
    bodyFont: FONTS[bodyKey].var,
    headingTtf: FONTS[headingKey].ttf,
    bodyTtf: FONTS[bodyKey].ttf,
    frame: FRAMES.includes(d.frame) ? d.frame : base.frame,
  };
}

// A short human description of the current look, for the AI's context.
export function describeDesign(design) {
  const r = resolveDesign(design);
  return `theme="${r.themeKey}", bg=${r.bg}, text=${r.text}, accent=${r.accent}, heading=${r.headingKey}, body=${r.bodyKey}, frame=${r.frame}`;
}
