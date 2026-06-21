import { redirect } from "next/navigation";

// The root URL goes straight to the TV board (no landing page).
// Any ?rotate=90/270 is forwarded so the bare domain can be used on the TV too.
export default async function Home({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = sp.rotate ? `?rotate=${encodeURIComponent(sp.rotate)}` : "";
  redirect(`/board${q}`);
}
