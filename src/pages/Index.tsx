import { useState, useRef, useEffect, useCallback } from "react";
import { Message, streamChat } from "@/lib/chat";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyState } from "@/components/EmptyState";
import { Sidebar, TabType } from "@/components/Sidebar";
import { NoteEditor } from "@/components/NoteEditor";
import { PracticeSection } from "@/components/PracticeSection";
import { PracticeQuiz } from "@/components/PracticeQuiz";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { useNotes } from "@/hooks/useNotes";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Difficulty = 'beginner' | 'intermediate' | 'hard';
type PracticeType = 'examination' | 'sat';

interface ActivePractice {
  difficulty: Difficulty;
  type: PracticeType;
}

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [activePractice, setActivePractice] = useState<ActivePractice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  
  const {
    conversations,
    currentConversation,
    messages,
    createConversation,
    addMessage,
    deleteConversation,
    selectConversation,
    clearCurrentConversation,
    setMessages,
  } = useConversations();
  
  const {
    notes,
    currentNote,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
    clearCurrentNote,
  } = useNotes();

  // Sync messages from DB to local state for display
  useEffect(() => {
    setLocalMessages(messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })));
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    let conversationId = currentConversation?.id;
    
    // Create a new conversation if none exists
    if (!conversationId) {
      const newConv = await createConversation();
      if (!newConv) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to create conversation",
        });
        return;
      }
      conversationId = newConv.id;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    // Add to local state immediately
    setLocalMessages((prev) => [...prev, userMessage]);
    
    // Save to database
    await addMessage("user", content, conversationId);
    
    setIsLoading(true);

    let assistantContent = "";
    const assistantId = crypto.randomUUID();

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setLocalMessages((prev) => {
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
      messages: [...localMessages, userMessage],
      onDelta: updateAssistant,
      onDone: async () => {
        setIsLoading(false);
        // Save assistant message to database
        await addMessage("assistant", assistantContent, conversationId);
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

  const handleNewChat = () => {
    clearCurrentConversation();
    setLocalMessages([]);
  };

  const handleNewNote = async () => {
    await createNote();
  };

  const handleStartPractice = (difficulty: Difficulty, type: PracticeType) => {
    setActivePractice({ difficulty, type });
  };

  const handleBackFromPractice = () => {
    setActivePractice(null);
  };

  // Reset practice when tab changes
  useEffect(() => {
    if (activeTab !== 'examination' && activeTab !== 'sat') {
      setActivePractice(null);
    }
  }, [activeTab]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="ambient-glow" />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const renderMainContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <>
            {/* Messages */}
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-6">
                {localMessages.length === 0 ? (
                  <EmptyState onSuggestionClick={sendMessage} />
                ) : (
                  <div className="space-y-4">
                    {localMessages.map((message) => (
                      <ChatMessage key={message.id} message={message} />
                    ))}
                    {isLoading && localMessages[localMessages.length - 1]?.role === "user" && (
                      <TypingIndicator />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </main>

            {/* Input */}
            <footer className="flex-shrink-0 border-t border-border/30 glass-effect">
              <div className="max-w-3xl mx-auto px-4 py-4">
                <ChatInput onSend={sendMessage} disabled={isLoading} />
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Study Bright AI is free to use. Responses may not always be accurate.
                </p>
              </div>
            </footer>
          </>
        );

      case 'notes':
        return (
          <NoteEditor
            note={currentNote}
            onUpdate={updateNote}
            onCreateNote={createNote}
          />
        );

      case 'examination':
      case 'sat':
        if (activePractice) {
          return (
            <PracticeQuiz
              difficulty={activePractice.difficulty}
              type={activePractice.type}
              onBack={handleBackFromPractice}
            />
          );
        }
        return (
          <PracticeSection
            type={activeTab}
            onStartPractice={handleStartPractice}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background relative">
      {/* Ambient background */}
      <div className="ambient-glow" />
      
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        conversations={conversations}
        notes={notes}
        currentConversationId={currentConversation?.id}
        currentNoteId={currentNote?.id}
        onSelectConversation={selectConversation}
        onSelectNote={selectNote}
        onNewChat={handleNewChat}
        onNewNote={handleNewNote}
        onDeleteConversation={deleteConversation}
        onDeleteNote={deleteNote}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {renderMainContent()}
      </div>
    </div>
  );
};

export default Index;