import { RESTAURANT_NAME } from "@/lib/menu";

export default function Home() {
  return (
    <main className="landing">
      <h1>{RESTAURANT_NAME} Specials</h1>
      <a href="/board">📺 Open the TV Board</a>
      <a href="/admin">📱 Edit Today&apos;s Special</a>
      <p className="sub">
        Open the TV Board on the restaurant screen. Edit from your phone.
      </p>
    </main>
  );
}
