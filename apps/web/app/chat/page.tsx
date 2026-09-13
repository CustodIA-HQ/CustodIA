"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import ChatSection from "../chat-section";
import { BackToHome } from "../components/back-to-home";
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
      <div className="chat-splash">
        <BackToHome className="back-to-home--splash" />
        <div className="chat-splash__mark">
          <Image
            src="/splash-logo.jpg"
            alt="CustodIA Agent"
            width={128}
            height={128}
            className="chat-splash__logo"
            priority
          />
        </div>
        <h1 className="chat-splash__title">CustodIA</h1>
        <p className="chat-splash__status">Initializing secure environment...</p>
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
