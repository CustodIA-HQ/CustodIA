import Link from "next/link";
import { BackToHome } from "./back-to-home";

export function SiteHeader({ active }: { active?: "home" | "chat" | "cases" | "holdings" }) {
  return (
    <header className="site-header">
      {active !== "home" ? <BackToHome /> : null}
      <Link className="site-header__brand" href="/">
        <img
          className="site-header__mark"
          src="/brand/falcon-eye/falcon-eye-reference.png"
          alt=""
          width={1448}
          height={1086}
        />
        CustodIA
      </Link>
      <span className="site-header__meta">Sepolia · Hedera testnet</span>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>ETHOnline 2026 · ENSv2 · The Graph · Hedera x402</p>
    </footer>
  );
}
