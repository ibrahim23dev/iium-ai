import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IIUM AI — Think Smarter. Create More.",
  description: "A thoughtful space to explore ideas and get things done.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
