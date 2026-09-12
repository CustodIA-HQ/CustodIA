"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatedAILogo } from "./AnimatedAILogo";

export function OpenChatButton({ href = "/chat" }: { href?: string }) {
  const [hovered, setHovered] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsInitializing(true);
    // Retardo artificial para que la transición minimalista se vea 
    // antes de que el router navegue instantáneamente y desmonte la vista.
    setTimeout(() => {
      router.push(href);
    }, 1500);
  };

  return (
    <>
      <a
        href={href}
        className="open-chat-btn"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        aria-label="Open chat"
      >
        <span className="open-chat-btn__logo" aria-hidden="true">
          <span
            className="open-chat-btn__ring open-chat-btn__ring--outer"
            style={{ animationDuration: hovered ? "1.2s" : "3s" }}
          />
          <span className="open-chat-btn__orbit">
            <span
              className="open-chat-btn__node"
              style={{ animationDuration: hovered ? "1s" : "2.4s" }}
            />
          </span>
          <span className="open-chat-btn__core">
            <svg
              width="14"
              height="16"
              viewBox="0 0 14 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M7 0.5L0.5 3.25V7.75C0.5 11.3438 3.3125 14.7188 7 15.5C10.6875 14.7188 13.5 11.3438 13.5 7.75V3.25L7 0.5Z"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
          </span>
        </span>
        <span className="open-chat-btn__label">Open chat</span>
        <span className="open-chat-btn__shimmer" aria-hidden="true" />
      </a>

      {isInitializing && (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#0a0f1e]">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <AnimatedAILogo size={80} />
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-xl font-bold tracking-widest text-[#00d4b4] uppercase">
                CustodIA Agent
              </h2>
              <p className="font-mono text-sm text-[#7f94aa]">
                Initializing secure environment...
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
