// Simple shared-password check for the admin endpoints.
// Good enough for a single-owner menu board; not meant for sensitive data.

export function checkAuth(req) {
  const expected = process.env.ADMIN_PASSWORD;
  // If no password is configured (local dev), allow everything.
  if (!expected) return true;
  const got = req.headers.get("x-admin-password");
  return !!got && got === expected;
}

// Check the token Make.com sends (query ?token= or x-make-token header).
export function checkMakeToken(req) {
  const expected = process.env.MAKE_TOKEN;
  if (!expected) return true; // dev: allow
  const url = new URL(req.url);
  const got = url.searchParams.get("token") || req.headers.get("x-make-token");
  return !!got && got === expected;
}
