"use client";

import { useEffect, useState } from "react";
import ChatSection from "../chat-section";
import { SiteHeader } from "../components/site-header";

export default function ChatPage() {
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (showWelcome) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="absolute h-full w-full animate-[spin_1.5s_linear_infinite] rounded-full border border-zinc-700 border-t-emerald-500"></div>
          <div className="absolute h-6 w-6 animate-[spin_2s_linear_infinite_reverse] rounded-full border border-zinc-800 border-b-amber-500"></div>
          <div className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 shadow-[0_0_8px_rgba(212,212,216,0.6)]"></div>
        </div>
        <h1 className="mt-8 text-2xl font-mono text-zinc-100 tracking-wide">
          CustodIA
        </h1>
        <p className="mt-3 text-sm font-mono text-zinc-500 animate-pulse">
          Initializing secure environment...
        </p>
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
