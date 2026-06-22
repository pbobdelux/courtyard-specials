"use client";

import { useEffect, useState } from "react";
import { resolveDesign } from "@/lib/themes";

// The TV board. Polls every 60s so it updates itself with no one touching the TV.
export default function BoardClient({ initial, rotate }) {
  const [s, setS] = useState(initial);

  // Poll every 60s so the board updates itself with no one touching the TV.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/special", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (alive) setS(d);
        }
      } catch {
        /* keep showing the last good board */
      }
    };
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Hold a screen wake lock so the TV never dims or sleeps while the board is up.
  // Re-acquire whenever the page becomes visible again (it drops on tab switch / sleep).
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator) lock = await navigator.wakeLock.request("screen");
      } catch {
        /* unsupported or blocked — device power settings must handle it */
      }
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        lock && lock.release();
      } catch {}
    };
  }, []);

  const wrapClass = "board-wrap" + (rotate ? ` fill r${rotate}` : "");
  const d = resolveDesign(s.design);
  const wrapStyle = {
    "--board": d.bg,
    "--chalk-cream": d.text,
    "--chalk-blue": d.accent,
    "--font-caveat": d.headingFont,
    "--font-hand": d.bodyFont,
  };

  // Full AI-generated board (the default): show that image filling the screen.
  if (s.image) {
    return (
      <div className={wrapClass} style={{ background: "#000" }}>
        <img
          src={s.image}
          alt="Specials board"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div className={wrapClass} style={wrapStyle}>
      <div className={`frame frame-${d.frame}`}>
        <div className="chalk">
          {s.holiday?.today ? (
            <div className="holiday-banner">
              {s.holiday.today.emoji} {s.holiday.today.greeting}
            </div>
          ) : null}

          {s.featured?.name ? (
            <>
              <div className="featured">
                <span className="feat-name">{s.featured.name}</span>
                {s.featured.price ? (
                  <span className="feat-price">${s.featured.price}</span>
                ) : null}
              </div>
              <div className="rule" />
            </>
          ) : null}

          <ul className="entrees">
            {s.entrees.map((e, i) => (
              <li key={i}>
                <span className="e-name">{e.name}</span>
                <span className="dots" />
                {e.price ? <span className="e-price">${e.price}</span> : null}
                {e.note ? <span className="e-note">✳ {e.note}</span> : null}
              </li>
            ))}
          </ul>

          {(s.sides?.length || s.soups?.length) ? (
            <div className="cols">
              <div className="col">
                <div className="col-label">Sides</div>
                {s.sides.map((x, i) => (
                  <div className="col-item" key={i}>
                    {x}
                  </div>
                ))}
              </div>
              <div className="col-div" />
              <div className="col">
                <div className="col-label">Soup</div>
                {s.soups.map((x, i) => (
                  <div className="col-item" key={i}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {s.holiday?.upcoming ? (
            <div className="holiday-upcoming">
              Coming up: {s.holiday.upcoming.name} · {s.holiday.upcoming.label}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
