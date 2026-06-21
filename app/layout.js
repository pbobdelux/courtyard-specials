import "./globals.css";
import { Caveat, Patrick_Hand } from "next/font/google";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-caveat",
  display: "swap",
});
const hand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-hand",
  display: "swap",
});

export const metadata = {
  title: "Courtyard — Daily Specials",
  description: "Today's specials board",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${caveat.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
