// Stores generated images in Vercel Blob and returns a public URL.

import { put } from "@vercel/blob";

export function blobConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// buffer: Buffer/Uint8Array of image bytes. Returns a public https URL.
export async function uploadImage(buffer, contentType = "image/png") {
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  // Unique key; access "public" so the board/social/Slack can load it.
  const name = `boards/${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}.${ext}`;
  const { url } = await put(name, buffer, { access: "public", contentType });
  return url;
}
