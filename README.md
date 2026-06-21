# Courtyard — Daily Specials Board

A tiny web app that runs the daily-specials screen at the restaurant and posts it
to Instagram + Facebook — all controlled from the owner's phone (or Slack).

- **TV board:** `https://YOUR-SITE.vercel.app/board` — open this fullscreen on the screen.
- **Phone editor:** `https://YOUR-SITE.vercel.app/admin` — bookmark this on the owner's phone.
- **Social posting:** happens automatically at **2:00 PM Central**, but only for specials the owner **approved**.

Everything below the "Daily routine" section is **one-time setup**. Once it's done, the owner only ever touches the phone page.

---

## ☀️ Daily routine (the owner)

You have two ways to drive the board. Use whichever you like.

### Option A — Slack, in plain English (the proof loop)
1. In your Slack channel, type the change in normal words — either with the slash
   command or by **@mentioning the bot**:
   - `/special tonight's featured is fried cauliflower at 11, add a prime rib at 34`
   - `@SpecialsBot swap the porterhouse for a ribeye at 29 and add a Father's Day note`
2. A few seconds later the bot posts a **proof** (a picture of the board) with two buttons:
   - **✅ Approve** → the TV board updates instantly, and it posts to Instagram + Facebook at **2:00 PM Central**.
   - **✏️ Reject & give feedback** → a box pops up; type what to change ("make it $32", "drop the cod").
     The bot revises and posts a fresh proof. Repeat until you're happy.
3. Your live board is never touched until you hit Approve.

### Option B — the phone page
1. Open the bookmarked **Edit Today's Special** page.
2. Type the featured item, entrées + prices, sides, soup.
3. **Save & Update Board** → TV updates within a minute.
4. **Approve & Schedule** → posts to Instagram + Facebook at **2:00 PM Central**.

Either way: nothing posts unless you approve, and editing after approving turns approval
back off so a half-finished change can't auto-post.

---

## 💵 What it costs

| Piece | Plan | Cost |
| --- | --- | --- |
| Vercel (hosting) | Hobby | Free |
| Upstash Redis (storage) | Free | Free |
| Make.com (social posting) | Free | Free (uses ~30 of 1,000 monthly ops) |
| Smart-TV browser | — | $0 |

Total: **$0/month.** A custom domain is optional (~$12/year).

---

## 🛠️ One-time setup

You only do this once. Takes about 30–45 minutes.

### 1. Put the code on GitHub
Create a new repo (e.g. `courtyard-specials`) and push this folder to it.
(If you prefer, you can also drag-and-drop deploy without GitHub, but GitHub gives
you automatic redeploys whenever the code changes.)

### 2. Deploy to Vercel (free)
1. Go to [vercel.com](https://vercel.com) → sign up with GitHub.
2. **Add New → Project** → import the repo. Framework auto-detects as **Next.js**. Click **Deploy**.
3. You'll get a URL like `https://courtyard-specials.vercel.app`. The `/board` and `/admin`
   pages work immediately (showing the sample menu).

### 3. Add storage (Upstash Redis, free)
Without this, edits won't survive — Vercel needs an external place to save the special.
1. In your Vercel project → **Storage** tab → **Create Database** → choose **Upstash (Redis)** → **Free**.
2. Vercel connects it and automatically adds the `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` environment variables for you.

### 4. Set the environment variables
In Vercel → project → **Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `RESTAURANT_NAME` | `Courtyard` |
| `ADMIN_PASSWORD` | a password the owner will type once on the phone |
| `MAKE_TOKEN` | a long random string (used by Make.com — keep it secret) |
| `PUBLIC_BASE_URL` | your full site URL, e.g. `https://courtyard-specials.vercel.app` (required so Slack/social can load the board image) |
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) → API Keys (powers plain-English editing) |
| `SLACK_SIGNING_SECRET` | (fill in during the Slack step below) |
| `SLACK_BOT_TOKEN` | (fill in during the Slack step below — starts with `xoxb-`) |

Click **Redeploy** after adding these so they take effect.

### 5. Set up the TV
On the restaurant screen, open the TV's web browser and go to **`.../board`**.
Put it fullscreen (most TVs: browser menu → Fullscreen).
- The page refreshes itself every minute — no need to ever touch it again.
- Tip: set the browser's home page to the `/board` URL so it reopens there after a power cycle.
- If the built-in TV browser is clunky or keeps timing out, a ~$35 **Amazon Fire TV Stick**
  with the **Silk browser** set to that URL is rock-solid for an always-on display.

### 6. Connect Instagram + Facebook (one-time, required)
Automated posting to Instagram requires (this is true for **any** tool — Buffer included):
1. The restaurant **Instagram** must be a **Business or Creator** account
   (Instagram app → Settings → Account type → switch to Business — free, 5 minutes).
2. That Instagram must be **linked to the restaurant's Facebook Page**
   (Facebook Page → Settings → Linked accounts → Instagram).

### 7. Set up the social automation (Make.com, free)
This is the piece that posts at 2 PM. You build one "scenario":

1. Sign up at [make.com](https://www.make.com) (free).
2. **Create a new scenario.** Add these modules in order:

   **a. Schedule (the trigger)**
   - Set the scenario to run **once a day at 2:00 PM**, timezone **America/Chicago**.

   **b. HTTP → "Make a request"** (ask our app what to post)
   - URL: `https://YOUR-SITE.vercel.app/api/pending-post?token=YOUR_MAKE_TOKEN`
     (use the exact `MAKE_TOKEN` you set in step 4)
   - Method: `GET`
   - Parse response: **Yes**

   **c. Router / Filter** (only continue if approved)
   - Add a filter after the HTTP module: continue only when **`ready` = `true`**.
     (When nothing is approved that day, `ready` is `false` and the scenario stops here — no post.)

   **d. Instagram for Business → "Create a Photo Post"**
   - Connect the restaurant's Instagram Business account.
   - Photo/Image URL: map the **`imageUrl`** field from step b.
   - Caption: map the **`caption`** field from step b.

   **e. Facebook Pages → "Create a Post"** (or "Upload a Photo")
   - Connect the restaurant's Facebook Page.
   - Photo URL: **`imageUrl`** from step b. Message: **`caption`** from step b.

   **f. HTTP → "Make a request"** (tell our app it posted, so it never double-posts)
   - URL: `https://YOUR-SITE.vercel.app/api/mark-posted?token=YOUR_MAKE_TOKEN`
   - Method: `POST`

3. Turn the scenario **ON**.

**Test it:** approve a special on the phone page, then in Make click **Run once** —
it should post immediately. After that it runs itself every day at 2 PM.

### 8. AI editing key (for the Slack proof loop)
1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → create a key.
2. Add it as `ANTHROPIC_API_KEY` in Vercel (step 4) and redeploy.
   - Add a few dollars of credit; at restaurant volume this lasts a very long time
     (each edit is a fraction of a cent).

### 9. Slack app (the proof loop)
This needs a bit more than a plain slash command, because the bot has to **post proofs**,
**show buttons**, and **open a feedback box**.

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch** → pick the workspace.
2. **OAuth & Permissions → Scopes → Bot Token Scopes**, add:
   - `commands`  (slash command)
   - `chat:write`  (post proofs)
   - `app_mentions:read`  (let you @mention the bot)
3. **Slash Commands → Create New Command:**
   - Command: `/special` · Request URL: `https://YOUR-SITE.vercel.app/api/slack`
4. **Interactivity & Shortcuts → On** · Request URL: `https://YOUR-SITE.vercel.app/api/slack`
   (this powers the Approve/Reject buttons and the feedback popup).
5. **Event Subscriptions → On** · Request URL: `https://YOUR-SITE.vercel.app/api/slack`
   → under **Subscribe to bot events** add `app_mention`. (Deploy the site first so Slack
   can verify the URL.)
6. **Install App** to the workspace. Then:
   - **OAuth & Permissions → Bot User OAuth Token** (`xoxb-…`) → set as `SLACK_BOT_TOKEN` in Vercel.
   - **Basic Information → Signing Secret** → set as `SLACK_SIGNING_SECRET` in Vercel.
   - Redeploy.
7. In Slack, **invite the bot to your channel** (`/invite @YourApp`) so it can post there.

Now type `/special <a change>` or `@YourApp <a change>` in that channel and you'll get a proof.

---

## 🧑‍💻 Running it on your own computer (for changes)

```bash
npm install
npm run dev      # http://localhost:3000
```

With no environment variables set, it stores the special in a local file
(`.data/special.json`) and skips the password — handy for testing.

### Project map
- `app/board` — the TV display (auto-refreshing chalkboard, holiday banner)
- `app/admin` — the phone editor
- `app/api/special` — read / save the special (+ live holiday info)
- `app/api/approve` — approve for the 2 PM post
- `app/api/pending-post` & `app/api/mark-posted` — the Make.com bridge
- `app/api/og` — generates the Instagram/Facebook image (`?draft=1` renders a pending proof)
- `app/api/slack` — the proof loop: slash command, @mention events, Approve/Reject buttons, feedback popup
- `lib/menu.js` — menu model + caption · `lib/holidays.js` — holiday detection (pure date math)
- `lib/store.js` — storage (live board + draft) · `lib/ai.js` — plain-English editing via Claude
- `lib/proof.js` — generate proof / publish draft · `lib/slackapi.js` — Slack Web API · `lib/auth.js` — passwords/tokens

To change the board's look, edit `app/globals.css` (board) and `app/api/og/route.js` (social image).
