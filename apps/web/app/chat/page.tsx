"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import ChatSection from "../chat-section";
import { SiteHeader } from "../components/site-header";

export default function ChatPage() {
  const [showWelcome, setShowWelcome] = useState(true);
  const videoSrc = "/splash-video-en.mp4"; // Forzado a inglés según lo solicitado

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-50 flex h-screen w-full items-center justify-center bg-zinc-950">
        {videoSrc && (
          <video
            autoPlay
            playsInline
            className="h-full w-full object-cover"
            onEnded={() => setShowWelcome(false)}
            onError={() => setShowWelcome(false)}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}
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
