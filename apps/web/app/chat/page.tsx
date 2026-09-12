import ChatSection from "../chat-section";
import { SiteHeader } from "../components/site-header";

export default function ChatPage() {
  return (
    <div className="chat-page" id="main">
      <SiteHeader active="chat" />
      <ChatSection fullPage />
    </div>
  );
}
