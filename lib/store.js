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

const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

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
