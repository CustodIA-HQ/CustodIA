"use client";

import { useEffect, useState } from "react";
import ChatSection from "../chat-section";
import { AnimatedAILogo } from "../components/AnimatedAILogo";
import { SiteHeader } from "../components/site-header";

export default function ChatPage() {
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (showWelcome) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-950">
        <AnimatedAILogo size={80} />
        <h1 className="mt-6 text-xl font-mono text-zinc-200">Welcome to CustodIA</h1>
        <p className="mt-2 text-sm font-mono text-zinc-500">Initializing secure environment...</p>
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
