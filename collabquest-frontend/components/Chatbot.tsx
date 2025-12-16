"use client";
import React, { useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll whenever messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = Cookies.get("token");
        if (!token) {
        console.error("AI history: token is null");
        return;
        }

        const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/ai/history`,
        {
            headers: {
            Authorization: `Bearer ${token}`,
            },
        }
        );
        
        if (!res.ok) throw new Error("Failed to load history");

        const data = await res.json();
        
        // Safety check: ensure history exists before mapping
        if (data && data.history) {
          const history = data.history.flatMap((m: any) => [
            { role: "user", text: m.question },
            { role: "bot", text: m.answer },
          ]);
          setMessages(history);
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    };

    fetchHistory();
  }, []);

  async function sendMessage() {
    if (!input.trim()) return;

    // Add user message immediately
    const userMessage = input; 
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput(""); // Clear input immediately for better UX
    setLoading(true);

    try {
        const token = Cookies.get("token");
        if (!token) {
        console.error("AI send: token is null");
        setLoading(false);
        return;
        }

        console.log("AI token being sent:", token);

        const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/chat/ai`,
        {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question: userMessage }),
        }
        );



      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.answer },
      ]);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Optional: Add an error message to the chat so the user knows
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full p-4 bg-white shadow-lg rounded-lg border border-gray-200">
      {/* Header */}
      <div className="border-b pb-2 mb-2">
        <h2 className="text-lg font-semibold text-gray-800">CollabQuest Mentor</h2>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-2 custom-scrollbar">
        {messages.length === 0 && !loading && (
          <p className="text-gray-400 text-center mt-10">Start a conversation...</p>
        )}
        
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[85%] text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-blue-600 text-white ml-auto rounded-br-none"
                : "bg-gray-100 text-gray-800 mr-auto rounded-bl-none border border-gray-200"
            }`}
          >
            {m.text}
          </div>
        ))}
        
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 ml-2">
             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
          </div>
        )}
        
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2 mt-auto">
        <input
          className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            loading || !input.trim() 
              ? "bg-gray-300 text-gray-500 cursor-not-allowed" 
              : "bg-black text-white hover:bg-gray-800"
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}