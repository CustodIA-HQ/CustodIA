import Link from "next/link";

const links = [
  { href: "/chat", id: "chat", label: "Chat" },
  { href: "/ux", id: "cases", label: "Cases" },
  { href: "/holdings", id: "holdings", label: "Holdings" },
] as const;

export function SiteHeader({ active }: { active?: "home" | "chat" | "cases" | "holdings" }) {
  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/">
        CustodIA
      </Link>
      <nav className="site-header__nav" aria-label="Product">
        {links.map((link) => (
          <Link
            key={link.id}
            className={
              active === link.id
                ? "site-header__link site-header__link--active"
                : "site-header__link"
            }
            href={link.href}
            aria-current={active === link.id ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <span className="site-header__meta">Sepolia · Hedera testnet</span>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>ETHOnline 2026 · ENSv2 · The Graph · Hedera x402</p>
      <p>
        <Link href="/ux">Generated UX</Link>
        {" · "}
        <Link href="/chat">Web chat</Link>
      </p>
    </footer>
  );
}
