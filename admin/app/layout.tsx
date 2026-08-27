import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tina Admin — TIS Agent",
  description: "Admin for Tina, the TIS WhatsApp assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
