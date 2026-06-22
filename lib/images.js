// Stores generated images in the existing KV store (they're small, ~200KB) and
// serves them through our own public endpoint (/api/img/<id>). Avoids needing a
// separate public blob store.

import { kvSet, kvGet } from "./store";

export function blobConfigured() {
  return true; // images live in the KV store, which is always available
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
}

// buffer: image bytes. Returns a public https URL.
export async function uploadImage(buffer, contentType = "image/png") {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  const b64 = Buffer.from(buffer).toString("base64");
  await kvSet(`img:${id}`, { ct: contentType, b64 });
  return `${baseUrl()}/api/img/${id}`;
}

export async function getStoredImage(id) {
  return await kvGet(`img:${id}`); // { ct, b64 } | null
}
