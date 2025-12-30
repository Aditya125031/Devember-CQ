import { Suspense } from "react";
import ChatClient from "./ChatClient";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chat - CollabQuest",
};

export default function ChatPage() {
  return (
    <div className="h-full w-full">
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center text-white bg-[#13161C]">
          <div className="flex flex-col items-center gap-4">
             <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             <p className="font-mono text-sm text-gray-400">Loading Secure Chat...</p>
          </div>
        </div>
      }>
        <ChatClient />
      </Suspense>
    </div>
  );
}
