"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePrivacyControls() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const clearHistory = async () => {
    if (!window.confirm("Delete all conversations from your account and this browser? This cannot be undone.")) return;
    const response = await fetch("/api/conversations", { method: "DELETE" });
    if (!response.ok) { setMessage("The server could not delete your saved history. Please retry when the database is available."); return; }
    localStorage.removeItem("iium-ai-conversations");
    localStorage.removeItem("iium-ai-history-owner");
    router.push("/");
  };
  return <section id="data-privacy" className="profile-privacy"><h2>Data &amp; Privacy</h2><p>Conversations belong to your account. Guest conversations are removed when a guest session ends or expires. Your browser also keeps a local conversation copy.</p><button onClick={() => void clearHistory()}>Delete all my conversations</button>{message && <p role="alert">{message}</p>}</section>;
}
