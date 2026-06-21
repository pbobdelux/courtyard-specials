"use client";

import { useEffect, useState } from "react";

const PW_KEY = "courtyard_pw";
const blankEntree = () => ({ name: "", price: "", note: "" });

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [featured, setFeatured] = useState({ name: "", price: "" });
  const [entrees, setEntrees] = useState([blankEntree()]);
  const [sides, setSides] = useState("");
  const [soups, setSoups] = useState("");
  const [status, setStatus] = useState(null); // {approved, approvedDate, postedDate}
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPw(localStorage.getItem(PW_KEY) || "");
    fetch("/api/special", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setFeatured(d.featured || { name: "", price: "" });
        setEntrees(d.entrees?.length ? d.entrees : [blankEntree()]);
        setSides((d.sides || []).join(", "));
        setSoups((d.soups || []).join(", "));
        setStatus({
          approved: d.approved,
          approvedDate: d.approvedDate,
          postedDate: d.postedDate,
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };

  const updateEntree = (i, key, val) => {
    setEntrees((arr) => arr.map((e, idx) => (idx === i ? { ...e, [key]: val } : e)));
  };
  const addEntree = () => setEntrees((arr) => [...arr, blankEntree()]);
  const removeEntree = (i) => setEntrees((arr) => arr.filter((_, idx) => idx !== i));

  const payload = () => ({
    featured,
    entrees: entrees.filter((e) => e.name.trim()),
    sides: sides.split(",").map((x) => x.trim()).filter(Boolean),
    soups: soups.split(",").map((x) => x.trim()).filter(Boolean),
  });

  const save = async () => {
    setBusy(true);
    localStorage.setItem(PW_KEY, pw);
    try {
      const r = await fetch("/api/special", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify(payload()),
      });
      if (r.status === 401) return flash("Wrong password");
      if (!r.ok) return flash("Save failed");
      const d = await r.json();
      setStatus({ approved: d.approved, approvedDate: d.approvedDate, postedDate: d.postedDate });
      flash("Saved! Board updated.");
    } catch {
      flash("Network error");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    localStorage.setItem(PW_KEY, pw);
    try {
      const r = await fetch("/api/approve", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (r.status === 401) return flash("Wrong password");
      if (!r.ok) return flash("Approve failed");
      const d = await r.json();
      setStatus({ approved: d.approved, approvedDate: d.approvedDate, postedDate: d.postedDate });
      flash("Approved! Posts at 2:00 PM Central.");
    } catch {
      flash("Network error");
    } finally {
      setBusy(false);
    }
  };

  let statusEl = null;
  if (status) {
    if (status.postedDate) {
      statusEl = <div className="status ok">✅ Posted to Instagram &amp; Facebook today.</div>;
    } else if (status.approved) {
      statusEl = (
        <div className="status ok">
          ✅ Approved — will post to Instagram &amp; Facebook at 2:00 PM Central.
        </div>
      );
    } else {
      statusEl = (
        <div className="status warn">
          ✏️ Draft saved. Tap <b>Approve &amp; Schedule</b> to post at 2:00 PM Central.
        </div>
      );
    }
  }

  return (
    <main className="admin">
      <h1>Today&apos;s Special</h1>
      {!loaded ? <div className="status muted">Loading…</div> : statusEl}

      <section>
        <h2>Password</h2>
        <label>Owner password</label>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Enter once, remembered on this phone"
        />
      </section>

      <section>
        <h2>Featured (blue header)</h2>
        <div className="row">
          <div className="grow">
            <label>Name</label>
            <input
              type="text"
              value={featured.name}
              onChange={(e) => setFeatured({ ...featured, name: e.target.value })}
              placeholder="Fried Cauliflower"
            />
          </div>
          <div className="price">
            <label>Price</label>
            <input
              type="text"
              inputMode="decimal"
              value={featured.price}
              onChange={(e) => setFeatured({ ...featured, price: e.target.value })}
              placeholder="11"
            />
          </div>
        </div>
      </section>

      <section>
        <h2>Entrées</h2>
        {entrees.map((e, i) => (
          <div key={i}>
            <div className="row">
              <div className="grow">
                <label>Name</label>
                <input
                  type="text"
                  value={e.name}
                  onChange={(ev) => updateEntree(i, "name", ev.target.value)}
                  placeholder="Prime Rib"
                />
              </div>
              <div className="price">
                <label>Price</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={e.price}
                  onChange={(ev) => updateEntree(i, "price", ev.target.value)}
                  placeholder="34"
                />
              </div>
              <button
                className="iconbtn"
                onClick={() => removeEntree(i)}
                aria-label="Remove"
                title="Remove"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={e.note}
              onChange={(ev) => updateEntree(i, "note", ev.target.value)}
              placeholder="Note (optional) — e.g. Salmon, Cod, Shrimp"
            />
          </div>
        ))}
        <button className="addbtn" onClick={addEntree}>
          + Add another item
        </button>
      </section>

      <section>
        <h2>Sides &amp; Soup</h2>
        <label>Sides (comma separated)</label>
        <input
          type="text"
          value={sides}
          onChange={(e) => setSides(e.target.value)}
          placeholder="Green Beans"
        />
        <label>Soups (comma separated)</label>
        <input
          type="text"
          value={soups}
          onChange={(e) => setSoups(e.target.value)}
          placeholder="French Onion, Cheesy Broccoli"
        />
      </section>

      <button className="btn primary" onClick={save} disabled={busy}>
        💾 Save &amp; Update Board
      </button>
      <button className="btn approve" onClick={approve} disabled={busy}>
        ✅ Approve &amp; Schedule (posts 2 PM Central)
      </button>
      <a className="btn ghost" href="/board" target="_blank" rel="noreferrer">
        👀 Preview the Board
      </a>

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
