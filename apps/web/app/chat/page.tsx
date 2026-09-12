"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
        <div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full shadow-[0_0_30px_rgba(16,185,129,0.25)]">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src="/splash-video.mp4" type="video/mp4" />
          </video>
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
