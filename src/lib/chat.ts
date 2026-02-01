export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

// Construct the chat URL with validation
const getSupabaseUrl = () => {
  const baseUrl = "https://ivzltzehosalijmkgzhb.supabase.co";
  if (!baseUrl) {
    console.error('VITE_SUPABASE_URL is not defined');
    return null;
  }
  return ${baseUrl}/functions/v1/chat;
};

const CHAT_URL = getSupabaseUrl();

export async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
}: {
  messages: Message[];
  onDelta: (deltaText: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}) {
  try {
    // Validate environment variables
    if (!CHAT_URL) {
      throw new Error('Supabase URL is not configured. Please check your environment variables.');
    }

    const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2emx0emVob3NhbGlqbWtnemhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTM1NzAsImV4cCI6MjA4MjQ4OTU3MH0.bYt53y0eBB9wZFafhTcxTOgSYr8-F7xQzTlPJktCRYE";
    if (!apiKey) {
      throw new Error('Supabase API key is not configured. Please check your environment variables.');
    }

    // Validate messages
    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    console.log('Sending chat request to:', CHAT_URL);

    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: Bearer ${apiKey},
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      let errorMessage = Request failed with status ${response.status};
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("No response body received from server");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch (parseError) {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          /* ignore parse errors in final flush */
        }
      }
    }

    onDone();
  } catch (error) {
    console.error('Chat stream error:', error);
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Helper function to check if chat service is available
export const isChatServiceConfigured = () => {
  return !!(
    "https://ivzltzehosalijmkgzhb.supabase.co" &&
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2emx0emVob3NhbGlqbWtnemhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTM1NzAsImV4cCI6MjA4MjQ4OTU3MH0.bYt53y0eBB9wZFafhTcxTOgSYr8-F7xQzTlPJktCRYE"
  );
};
