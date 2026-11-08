import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edge Terminal — Market Intelligence",
  description: "A responsive market analytics terminal for metals traders.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
