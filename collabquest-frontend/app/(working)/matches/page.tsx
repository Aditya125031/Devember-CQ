import { Suspense } from "react";
import MatchesClient from "./MatchesClient";
import { Loader2 } from "lucide-react";

// This is key for resolving the build error
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Matches - CollabQuest",
};

export default function MatchesPage() {
    return (
        <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-[#09090b] text-white"><Loader2 className="animate-spin w-12 h-12 text-violet-500" /></div>}>
            <MatchesClient />
        </Suspense>
    );
}