"use client";

import { useEffect, useState } from "react";

// The TV board. Polls every 60s so it updates itself with no one touching the TV.
export default function BoardClient({ initial, rotate }) {
  const [s, setS] = useState(initial);
  const wrapClass = "board-wrap" + (rotate ? ` fill r${rotate}` : "");

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

  return (
    <div className={wrapClass}>
      <div className="frame">
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
