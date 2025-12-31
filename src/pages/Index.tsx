import { useState, useRef, useEffect, useCallback } from "react";
import { Message, streamChat } from "@/lib/chat";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyState } from "@/components/EmptyState";
import { BottomNav, TabType } from "@/components/BottomNav";
import { NoteEditor } from "@/components/NoteEditor";
import { SubjectsSection } from "@/components/SubjectsSection";
import { FlashcardsSection } from "@/components/FlashcardsSection";
import { ExaminationSection } from "@/components/ExaminationSection";
import { SATSection } from "@/components/SATSection";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { useNotes } from "@/hooks/useNotes";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

interface LearningContext {
  subject?: string;
  grade?: string;
}

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [learningContext, setLearningContext] = useState<LearningContext>({});
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
  } = useConversations();
  
  const {
    notes,
    currentNote,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
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

    // Build context-aware message
    let contextPrefix = '';
    if (learningContext.subject && learningContext.grade) {
      contextPrefix = `[Context: Teaching ${learningContext.subject} at ${learningContext.grade} level]\n\n`;
    }

    const messagesWithContext = [
      ...localMessages.map(m => ({ ...m, content: m.content })),
      { ...userMessage, content: contextPrefix + userMessage.content }
    ];

    await streamChat({
      messages: messagesWithContext,
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
    setLearningContext({});
  };

  const handleNewNote = async () => {
    await createNote();
  };

  const handleSelectSubject = (subject: string, grade: string) => {
    setLearningContext({ subject, grade });
    setActiveTab('chat');
    // Send initial message to start the lecture
    const initialMessage = `I want to learn about ${subject} at ${grade} level. Please provide a comprehensive lecture that includes:
1. Clear explanation of key concepts
2. Important definitions
3. Examples appropriate for my grade level
4. Common mistakes to avoid
5. A summary for revision

Start with an overview and then go into detail.`;
    setTimeout(() => sendMessage(initialMessage), 100);
  };

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
            {learningContext.subject && (
              <div className="px-4 py-2 bg-primary/10 border-b border-primary/20">
                <p className="text-xs text-primary font-medium text-center">
                  📚 Learning: {learningContext.subject} • {learningContext.grade}
                </p>
              </div>
            )}
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

      case 'subjects':
        return <SubjectsSection onSelectSubject={handleSelectSubject} />;

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
