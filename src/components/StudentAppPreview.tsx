import { useState, useRef, useEffect, useCallback } from "react";
import { Message, streamChat } from "@/lib/chat";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyState } from "@/components/EmptyState";
import { BottomNav, TabType } from "@/components/BottomNav";
import { SubjectsSection } from "@/components/SubjectsSection";
import { FlashcardsSection } from "@/components/FlashcardsSection";
import { ExaminationSection } from "@/components/ExaminationSection";
import { SATSection } from "@/components/SATSection";
import { NotesSection } from "@/components/NotesSection";
import { useToast } from "@/hooks/use-toast";

// This is a preview version of the student app for Super Admin testing
export function StudentAppPreview() {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    let assistantContent = "";
    const assistantId = crypto.randomUUID();

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: assistantContent,
          },
        ];
      });
    };

    await streamChat({
      messages: [...messages, userMessage],
      onDelta: updateAssistant,
      onDone: async () => {
        setIsLoading(false);
      },
      onError: (error) => {
        setIsLoading(false);
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Something went wrong. Please try again.",
        });
      },
    });
  };

  const renderMainContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <div className="flex flex-col h-full pt-14 pb-20">
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-4 py-4">
                {messages.length === 0 ? (
                  <EmptyState onSuggestionClick={sendMessage} />
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <ChatMessage key={message.id} message={message} />
                    ))}
                    {isLoading && messages[messages.length - 1]?.role === "user" && (
                      <TypingIndicator />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </main>

            <footer className="fixed bottom-16 left-0 right-0 glass-effect-strong border-t border-border/30 z-40">
              <div className="max-w-2xl mx-auto px-4 py-3">
                <ChatInput onSend={sendMessage} disabled={isLoading} />
              </div>
            </footer>
          </div>
        );

      case 'subjects':
        return <SubjectsSection />;

      case 'notes':
        return <NotesSection />;

      case 'flashcards':
        return <FlashcardsSection />;

      case 'examination':
        return <ExaminationSection />;

      case 'sat':
        return <SATSection />;

      default:
        return null;
    }
  };

  return (
    <div className="h-[calc(100vh-40px)] bg-background relative flex flex-col overflow-hidden">
      <div className="ambient-glow" />
      
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasSchool={true}
      />

      <div className="flex-1 relative z-10 overflow-hidden">
        {renderMainContent()}
      </div>
    </div>
  );
}
