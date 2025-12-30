import { Suspense } from "react";
import MyProjectsClient from "./MyProjectsClient";
import { Loader2 } from "lucide-react";

// This forces dynamic rendering to resolve the useSearchParams/prerendering issue
export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Projects - CollabQuest",
};

export default function MyProjectsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white"><Loader2 className="animate-spin w-8 h-8 text-purple-500" /></div>}>
            <MyProjectsClient />
        </Suspense>
    );
}