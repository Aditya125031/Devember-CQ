import { Suspense } from "react";
import SavedProjectsClient from "./SavedProjectsClient";
import { Loader2 } from "lucide-react";

// Force dynamic rendering to prevent static build issues
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Saved Projects - CollabQuest",
};

export default function SavedProjectsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white"><Loader2 className="animate-spin w-8 h-8 text-yellow-500" /></div>}>
            <SavedProjectsClient />
        </Suspense>
    );
}