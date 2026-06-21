import "./globals.css";
import {
  Patrick_Hand,
  Lobster,
  Pacifico,
  DM_Serif_Display,
  Bebas_Neue,
  Poppins,
} from "next/font/google";

const casual = Patrick_Hand({ subsets: ["latin"], weight: "400", variable: "--font-casual", display: "swap" });
const script = Lobster({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });
const fancy = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-fancy", display: "swap" });
const serif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-serif", display: "swap" });
const condensed = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-condensed", display: "swap" });
const clean = Poppins({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-clean", display: "swap" });

const fontVars = [casual, script, fancy, serif, condensed, clean].map((f) => f.variable).join(" ");

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
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
