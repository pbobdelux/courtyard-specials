// Key-value storage. Uses Upstash Redis when configured (production), otherwise
// a local JSON file so the app runs with zero setup during development.
//
// Keys:
//   special:current — the LIVE board (what the TV + social show)
//   special:draft   — an in-progress draft awaiting proof approval

import { promises as fs } from "fs";
import path from "path";

const CURRENT = "special:current";
const DRAFT = "special:draft";

// Find the Upstash/KV REST credentials regardless of the prefix Vercel assigns
// (e.g. UPSTASH_REDIS_REST_URL, KV_REST_API_URL, STORAGE_KV_REST_API_URL, …).
function resolveRedisCreds() {
  const env = process.env;
  let url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "";
  let token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "";
  if (!url) {
    const key = Object.keys(env).find(
      (k) => /REST_API_URL$/.test(k) || /REDIS_REST_URL$/.test(k)
    );
    if (key) url = env[key] || "";
  }
  if (!token) {
    // Prefer a write token (skip any READ_ONLY token).
    const key = Object.keys(env).find(
      (k) =>
        (/REST_API_TOKEN$/.test(k) || /REDIS_REST_TOKEN$/.test(k)) &&
        !/READ_ONLY/.test(k)
    );
    if (key) token = env[key] || "";
  }
  return { url, token };
}

const { url, token } = resolveRedisCreds();

let redis = null;
if (url && token) {
  const { Redis } = require("@upstash/redis");
  redis = new Redis({ url, token });
}

const fileDir = path.join(process.cwd(), ".data");
const filePath = path.join(fileDir, "store.json");

async function readAll() {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}
async function writeAll(obj) {
  await fs.mkdir(fileDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), "utf8");
}

export async function kvGet(key) {
  if (redis) return (await redis.get(key)) || null;
  const all = await readAll();
  return all[key] ?? null;
}
export async function kvSet(key, val) {
  if (redis) {
    await redis.set(key, val);
    return;
  }
  const all = await readAll();
  all[key] = val;
  await writeAll(all);
}
export async function kvDel(key) {
  if (redis) {
    await redis.del(key);
    return;
  }
  const all = await readAll();
  delete all[key];
  await writeAll(all);
}

export const getSpecial = () => kvGet(CURRENT);
export const setSpecial = (v) => kvSet(CURRENT, v);
export const getDraft = () => kvGet(DRAFT);
export const setDraft = (v) => kvSet(DRAFT, v);
export const clearDraft = () => kvDel(DRAFT);
