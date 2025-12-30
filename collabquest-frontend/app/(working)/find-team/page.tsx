import { Suspense } from "react";
import FindTeamClient from "./FindTeamClient";

// This is the key line to fix the build error
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find Team - CollabQuest",
};

export default function FindTeamPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-white">Loading Teams...</div>}>
      <FindTeamClient />
    </Suspense>
  );
}