import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Message, streamChat } from "@/lib/chat";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyState } from "@/components/EmptyState";
import { BottomNav, TabType } from "@/components/BottomNav";
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

  // Build learning context from all conversations for practice
  const learningContext = useMemo(() => {
    // Get messages from all conversations to build context
    const allTopics: string[] = [];
    
    // Use current conversation messages
    messages.forEach(m => {
      if (m.role === 'user') {
        allTopics.push(m.content);
      }
    });

    // Also include note content
    notes.forEach(note => {
      if (note.content) {
        allTopics.push(note.content);
      }
    });

    if (allTopics.length === 0) {
      return '';
    }

    // Summarize topics (limit to prevent token overflow)
    const context = allTopics.slice(-20).join('\n\n');
    return context.slice(0, 3000);
  }, [messages, notes]);

  const hasLearningHistory = learningContext.length > 50;

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

    setLocalMessages((prev) => [...prev, userMessage]);
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
          <div className="flex flex-col h-full pt-14 pb-20">
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-4 py-4">
                {localMessages.length === 0 ? (
                  <EmptyState onSuggestionClick={sendMessage} />
                ) : (
                  <div className="space-y-3">
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

            <footer className="fixed bottom-16 left-0 right-0 glass-effect-strong border-t border-border/30 z-40">
              <div className="max-w-2xl mx-auto px-4 py-3">
                <ChatInput onSend={sendMessage} disabled={isLoading} />
              </div>
            </footer>
          </div>
        );

      case 'notes':
        return (
          <div className="pt-14 pb-20 h-full">
            <NoteEditor
              note={currentNote}
              onUpdate={updateNote}
              onCreateNote={createNote}
            />
          </div>
        );

      case 'examination':
      case 'sat':
        if (activePractice) {
          return (
            <PracticeQuiz
              difficulty={activePractice.difficulty}
              type={activePractice.type}
              onBack={handleBackFromPractice}
              learningContext={learningContext}
            />
          );
        }
        return (
          <PracticeSection
            type={activeTab}
            onStartPractice={handleStartPractice}
            hasLearningHistory={hasLearningHistory}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background relative overflow-hidden">
      <div className="ambient-glow" />
      
      <BottomNav
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

      <div className="h-full relative z-10">
        {renderMainContent()}
      </div>
    </div>
  );
};

export default Index;