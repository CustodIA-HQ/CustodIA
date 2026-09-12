"use client";

import { useState } from "react";
import Image from "next/image";
import ChatSection from "../chat-section";
import { SiteHeader } from "../components/site-header";

export default function ChatPage() {
  const [showWelcome, setShowWelcome] = useState(true);

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-50 flex h-screen w-full items-center justify-center bg-zinc-950">
        <video
          autoPlay
          playsInline
          className="h-full w-full object-cover"
          onEnded={() => setShowWelcome(false)}
          onError={() => setShowWelcome(false)}
        >
          <source src="/splash-video.mp4" type="video/mp4" />
        </video>
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
