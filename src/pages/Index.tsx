import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Message, streamChat } from "@/lib/chat";
import { generateId } from "@/lib/utils";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistoryDrawer } from "@/components/ChatHistoryDrawer";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmptyState } from "@/components/EmptyState";
import { BottomNav, TabType } from "@/components/BottomNav";
import { SubjectsSection } from "@/components/SubjectsSection";
import { FlashcardsSection } from "@/components/FlashcardsSection";
import { ExaminationSection } from "@/components/ExaminationSection";
import { SATSection } from "@/components/SATSection";
import { NotesSection } from "@/components/NotesSection";
import { ProfileSection } from "@/components/ProfileSection";
import { PodcastsSection } from "@/components/PodcastsSection";

import { AssignmentsSection } from "@/components/AssignmentsSection";
import { StudentReportCards } from "@/components/student/StudentReportCards";
import { StudentHomeGrid, GridAction } from "@/components/StudentHomeGrid";
import { WeeklyPlanSection } from "@/components/WeeklyPlanSection";
import { BannerAd } from "@/components/BannerAd";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { useNotes } from "@/hooks/useNotes";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useThemeLanguage } from "@/hooks/useThemeLanguage";
import { Navigate } from "react-router-dom";
import { Loader2, ArrowLeft, Sparkles, Menu, History } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { 
    profile, 
    school, 
    loading: roleLoading, 
    isSuperAdmin, 
    isSchoolAdmin, 
    isTeacher, 
    isStudent,
    hasProfile
  } = useRoleGuard();
  const { t, language } = useThemeLanguage();

  const {
    conversations,
    currentConversation,
    messages,
    createConversation,
    addMessage,
    deleteConversation,
    selectConversation,
    clearCurrentConversation,
    fetchBackgroundContext,
  } = useConversations();
  
  const {
    notes,
    currentNote,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  } = useNotes();

  useEffect(() => {
    setLocalMessages(messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
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
        toast({ variant: "destructive", title: "Error", description: "Failed to create conversation" });
        return;
      }
      conversationId = newConv.id;
    }

    const userMessage: Message = { id: generateId(), role: "user", content };
    setLocalMessages((prev) => [...prev, userMessage]);
    await addMessage("user", content, conversationId);
    setIsLoading(true);

    let assistantContent = "";
    const assistantId = generateId();

    const updateAssistant = (chunk: string) => {
      assistantContent += chunk;
      setLocalMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { id: assistantId, role: "assistant", content: assistantContent }];
      });
    };

    const messagesWithContext = [...localMessages.map(m => ({ ...m, content: m.content })), userMessage];

    // Fetch background context from past conversations
    const bgContext = await fetchBackgroundContext(conversationId);

    await streamChat({
      messages: messagesWithContext,
      language,
      backgroundContext: bgContext,
      onDelta: updateAssistant,
      onDone: async () => {
        setIsLoading(false);
        await addMessage("assistant", assistantContent, conversationId);
      },
      onError: (error) => {
        setIsLoading(false);
        toast({ variant: "destructive", title: "Error", description: error.message || "Something went wrong." });
      },
    });
  };

  const handleNewChat = () => {
    clearCurrentConversation();
    setLocalMessages([]);
  };

  const handleGridNavigate = (action: GridAction) => {
    if (action === 'settings') {
      setActiveTab('profile');
    } else if (action === 'weeklyplan') {
      setActiveTab('weeklyplan');
    } else {
      setActiveTab(action as TabType);
    }
  };

  // Loading states
  if (authLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="ambient-glow" />
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isSuperAdmin) return <Navigate to="/super-admin" replace />;
  if (isSchoolAdmin && profile?.is_active) return <Navigate to="/admin" replace />;
  if (isTeacher && profile?.is_active) return <Navigate to="/teacher" replace />;
  if (!hasProfile) return <Navigate to="/activate-school" replace />;
  if (profile?.status === 'pending' || profile?.status === 'rejected') return <Navigate to="/pending-approval" replace />;

  // Sub-page header with back button
  const isSubPage = !['home', 'weeklyplan', 'profile'].includes(activeTab);

  const renderMainContent = () => {
    switch (activeTab) {
      case 'home':
        return <StudentHomeGrid onNavigate={handleGridNavigate} hasSchool={!!school} />;

      case 'weeklyplan':
        return <WeeklyPlanSection />;

      case 'chat':
        return (
          <div className="flex flex-col h-full pt-14">
            {/* History button */}
            <div className="flex items-center justify-between px-4 pt-2">
              <BannerAd location="home" />
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setHistoryOpen(true)}
                >
                  <History size={16} />
                </Button>
              </div>
            </div>
            <main className="flex-1 overflow-y-auto pb-36">
              <div className="max-w-2xl mx-auto px-4 py-4">
                {localMessages.length === 0 ? (
                  <EmptyState onSuggestionClick={sendMessage} />
                ) : (
                  <div className="space-y-3">
                    {localMessages.map((message, idx) => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        isStreaming={isLoading && message.role === "assistant" && idx === localMessages.length - 1}
                      />
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
            <ChatHistoryDrawer
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              conversations={conversations}
              currentId={currentConversation?.id}
              onSelect={(conv) => { selectConversation(conv); }}
              onDelete={deleteConversation}
              onNewChat={handleNewChat}
            />
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
      case 'profile':
        return <ProfileSection />;
      case 'podcasts':
        return <PodcastsSection />;
      case 'assignments':
        return <AssignmentsSection />;
      case 'reports':
        return profile ? <StudentReportCards studentId={profile.id} /> : null;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background relative flex flex-col overflow-hidden">
      <AnimatedBackground />
      
      {/* Top bar - only show on sub-pages for back navigation */}
      {isSubPage && (
        <header className="fixed top-0 left-0 right-0 z-50 h-14 glass-effect-strong border-b border-border/30">
          <div className="flex items-center h-full px-4 gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setActiveTab('home')}>
              <ArrowLeft size={20} />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
                <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-sm capitalize">
                {activeTab === 'sat' ? t('SAT Prep', 'تحضير SAT') 
                  : activeTab === 'chat' ? t('AI Tutor', 'المعلم الذكي')
                  : activeTab === 'subjects' ? t('Subjects', 'المواد')
                  : activeTab === 'notes' ? t('Notes', 'الملاحظات')
                  : activeTab === 'flashcards' ? t('Flashcards', 'البطاقات التعليمية')
                  : activeTab === 'examination' ? t('Exams', 'الاختبارات')
                  : activeTab === 'assignments' ? t('Assignments', 'الواجبات')
                  : activeTab === 'reports' ? t('Report Cards', 'كشوف الدرجات')
                  : activeTab === 'podcasts' ? t('AI Podcasts', 'بودكاست AI')
                  : activeTab}
              </span>
            </div>
          </div>
        </header>
      )}

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasSchool={!!school}
      />

      <div className="flex-1 relative z-10 overflow-hidden">
        {renderMainContent()}
      </div>
    </div>
  );
};

export default Index;
