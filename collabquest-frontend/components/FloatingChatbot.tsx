"use client";
import { useState } from "react";
import Chatbot from "./Chatbot";

export default function FloatingChatbot() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 bg-black text-white rounded-full px-4 py-3 shadow-lg"
      >
        AI
      </button>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-96 h-[500px] bg-white border rounded-xl shadow-xl">
          <Chatbot />
        </div>
      )}
    </>
  );
}
