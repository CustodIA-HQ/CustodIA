"use client";

import { useEffect, useState } from "react";
import ChatSection from "../chat-section";
import { BackToHome } from "../components/back-to-home";
import { SiteHeader } from "../components/site-header";
import { SplashOrbit } from "../components/splash-orbit";

const SPLASH_MS = 2500;
const SPLASH_EXIT_MS = 400;
const TITLE = "CustodIA";

export default function ChatPage() {
  const [phase, setPhase] = useState<"splash" | "leaving" | "done">("splash");

  useEffect(() => {
    const leaveTimer = setTimeout(() => setPhase("leaving"), SPLASH_MS - SPLASH_EXIT_MS);
    const doneTimer = setTimeout(() => setPhase("done"), SPLASH_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase !== "done") {
    return (
      <div
        className={phase === "leaving" ? "chat-splash chat-splash--leaving" : "chat-splash"}
        style={{ "--splash-ms": `${SPLASH_MS}ms` } as React.CSSProperties}
      >
        <BackToHome className="back-to-home--splash" />
        <div className="chat-splash__mark">
          <SplashOrbit />
        </div>
        <h1 className="chat-splash__title" aria-label={TITLE}>
          {TITLE.split("").map((char, index) => (
            <span key={index} aria-hidden="true" style={{ animationDelay: `${0.35 + index * 0.06}s` }}>
              {char}
            </span>
          ))}
        </h1>
        <p className="chat-splash__status">
          Initializing secure environment
          <span className="chat-splash__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
        <div className="chat-splash__progress" aria-hidden="true">
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page" id="main">
      <SiteHeader active="chat" />
      <ChatSection fullPage />
    </div>
  );
}
