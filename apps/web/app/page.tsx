import Image from "next/image";
import ChatSection from "./chat-section";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 60%, #071218 100%)",
        color: "#e2f0ff",
        margin: 0,
        padding: 0,
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.25rem 2.5rem",
          borderBottom: "1px solid rgba(0,212,180,0.12)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(10,15,30,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        <span
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            fontSize: 11,
            fontWeight: 700,
            color: "#00d4b4",
          }}
        >
          CustodIA
        </span>
        <div className="nav-meta">
          <a className="nav-chat-link" href="#chat">
            Open chat
          </a>
          <span
            style={{
              fontSize: 12,
              color: "rgba(226,240,255,0.35)",
              letterSpacing: "0.05em",
            }}
          >
            ETHOnline 2026
          </span>
        </div>
      </nav>

      {/* ── Hero Image ── */}
      <div style={{ position: "relative", width: "100%", height: 420, overflow: "hidden" }}>
        <Image
          src="/hero.jpg"
          alt="CustodIA — AI-powered autonomous finance runtime with blockchain security shields"
          fill
          priority
          style={{ objectFit: "cover", objectPosition: "center 30%" }}
        />
        {/* Bottom fade so content blends into dark background */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "50%",
            background: "linear-gradient(to bottom, transparent, #0a0f1e)",
          }}
        />
      </div>

      {/* ── Content ── */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "2rem 2rem 4rem",
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.22em",
            fontSize: 11,
            fontWeight: 700,
            color: "#00d4b4",
            margin: "0 0 0.75rem",
          }}
        >
          Universal Agentic Finance Runtime
        </p>

        {/* gradient-text uses the CSS class to avoid hydration mismatch */}
        <h1
          className="gradient-text"
          style={{
            fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
            fontWeight: 800,
            lineHeight: 1.18,
            margin: "0 0 1.25rem",
          }}
        >
          The agent proposes.
          <br />
          The human sets the boundary.
          <br />
          The policy enforces it.
        </h1>

        <p
          style={{
            color: "rgba(226,240,255,0.58)",
            lineHeight: 1.75,
            fontSize: 16,
            maxWidth: 600,
            margin: "0 0 2.5rem",
          }}
        >
          A conversational runtime that turns a vague financial intent into a bounded, revocable,
          machine-executable mandate — powered by{" "}
          <span style={{ color: "#00d4b4" }}>The Graph</span>,{" "}
          <span style={{ color: "#00d4b4" }}>Hedera x402</span> and{" "}
          <span style={{ color: "#00d4b4" }}>ENSv2</span>.
        </p>

        {/* ── Status pill ── */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(0,212,180,0.07)",
            border: "1px solid rgba(0,212,180,0.22)",
            borderRadius: 999,
            padding: "0.45rem 1.1rem",
            fontSize: 13,
            color: "rgba(226,240,255,0.5)",
            marginBottom: "2.5rem",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#00d4b4",
              boxShadow: "0 0 8px #00d4b4",
              flexShrink: 0,
            }}
          />
          Chat surface ready — agent route is live
        </div>

        {/* ── Sponsor cards ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "ENSv2", sub: "Identity & Delegation", track: "Sepolia" },
            { label: "The Graph", sub: "Live Market Intelligence", track: "Subgraph" },
            { label: "Hedera x402", sub: "Agentic Payments", track: "Testnet" },
          ].map(({ label, sub, track }) => (
            <div
              key={label}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(0,212,180,0.16)",
                borderRadius: 10,
                padding: "0.8rem 1.25rem",
                minWidth: 160,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2f0ff" }}>{label}</span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#00d4b4",
                    background: "rgba(0,212,180,0.1)",
                    borderRadius: 4,
                    padding: "1px 5px",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {track}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(226,240,255,0.38)" }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <ChatSection />

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: "1px solid rgba(0,212,180,0.08)",
          padding: "1.25rem 2.5rem",
          textAlign: "center",
          fontSize: 11,
          color: "rgba(226,240,255,0.2)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        ETHOnline 2026 · ENS · The Graph · Hedera
      </div>
    </main>
  );
}
