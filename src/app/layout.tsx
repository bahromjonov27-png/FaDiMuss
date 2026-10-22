import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fadimuss.uz"),
  alternates: {
    canonical: "/",
  },
  title: "FaDiMuss | O'sish yo'lingiz",
  description: "O'qish, maqsadlar va kundalik rivojlanish uchun shaxsiy yordamchi.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="uz"><body>{children}</body></html>;
}