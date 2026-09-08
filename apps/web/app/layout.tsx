import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "CustodIA — Universal Agentic Finance Runtime",
  description:
    "Chat intent → live Graph research → paid x402 risk context on Hedera → generated UI → wallet-signed mandate → ENSv2 task record.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
