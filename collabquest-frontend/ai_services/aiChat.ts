const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function askAI(question: string, token: string) {
  const res = await fetch(`${API_URL}/chat/ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    throw new Error("AI request failed");
  }

  return res.json();
}

export async function getAIHistory(token: string) {
  const res = await fetch(`${API_URL}/chat/ai/history`, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch AI history");
  }

  return res.json();
}
