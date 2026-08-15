import { useState, useEffect, useCallback } from "react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LiquidField } from "@/components/shell/LiquidField";

import { BottomNav, TabType } from "@/components/BottomNav";
import { SubjectsSection } from "@/components/SubjectsSection";
import { FlashcardsSection } from "@/components/FlashcardsSection";
import { ExaminationSection } from "@/components/ExaminationSection";
import { SATSection } from "@/components/SATSection";
import { NotesSection } from "@/components/NotesSection";
import { ProfileSection } from "@/components/ProfileSection";
import { PodcastsSection } from "@/components/PodcastsSection";

import { AssignmentsSection } from "@/components/AssignmentsSection";
import { TenantExtensionsSection } from "@/components/extensions/TenantExtensionsSection";
import { StudentReportCards } from "@/components/student/StudentReportCards";
import { AnnouncementsViewer } from "@/components/AnnouncementsViewer";
import { TripsViewer } from "@/components/TripsViewer";
import { StudyBuddy } from "@/components/student/StudyBuddy";
import { MindMapGenerator } from "@/components/student/MindMapGenerator";
import { GoalTracker } from "@/components/student/GoalTracker";
import { Leaderboard } from "@/components/student/Leaderboard";
import { FocusTimer } from "@/components/student/FocusTimer";
import { AIStudyPlan } from "@/components/student/AIStudyPlan";
import { GraphCalculator } from "@/components/student/GraphCalculator";
import { StudentHomeGrid, GridAction } from "@/components/StudentHomeGrid";
import { WeeklyPlanSection } from "@/components/WeeklyPlanSection";
import { BannerAd } from "@/components/BannerAd";
import { FloatingTimer } from "@/components/student/FloatingTimer";
import { StudentLiveList } from "@/components/student/StudentLiveList";
import { useAuth } from "@/hooks/useAuth";
import { useNotes } from "@/hooks/useNotes";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { useThemeLanguage } from "@/hooks/useThemeLanguage";
import { useAdaptiveLevel } from "@/hooks/useAdaptiveLevel";
import { useLearningStyle } from "@/hooks/useLearningStyle";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Sparkles, Timer, NotebookPen, Target, Map } from "lucide-react";
import { LiquidLens } from "@/components/motion/LiquidLens";
import { LuminaLogo } from "@/components/LuminaLogo";
import { Button } from "@/components/ui/button";
import { DesktopShell } from "@/components/shell/DesktopShell";
import { DesktopHome } from "@/components/student/DesktopHome";
import { useIsMobile } from "@/hooks/use-mobile";


const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const navigate = useNavigate();
  const isDesktop = !useIsMobile();

  
  const { user, loading: authLoading } = useAuth();
  const { 
    profile, 
    school, 
    loading: roleLoading, 
    isSuperAdmin, 
    isSchoolAdmin, 
    isTeacher, 
    isStudent,
    isParent,
    hasProfile
  } = useRoleGuard();
  const { t, language } = useThemeLanguage();
  const { currentLevel: adaptiveLevel } = useAdaptiveLevel();
  const { recalculate: recalculateLearningStyle } = useLearningStyle();
  const { trackPageVisit } = useActivityTracker();

  const {
    notes,
    currentNote,
    createNote,
    updateNote,
    deleteNote,
    selectNote,
  } = useNotes();


  // Track page visits and recalculate learning style periodically
  useEffect(() => {
    if (activeTab !== 'home' && activeTab !== 'profile') {
      trackPageVisit(activeTab);
    }
  }, [activeTab, trackPageVisit]);

  // Recalculate learning style when returning to home
  useEffect(() => {
    if (activeTab === 'home') {
      recalculateLearningStyle();
    }
  }, [activeTab, recalculateLearningStyle]);

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
  if (isParent) return <Navigate to="/parent" replace />;
  if (!hasProfile) {
    const socialOnboardingFlow = sessionStorage.getItem('luminaSocialOnboardingFlow');
    if (socialOnboardingFlow === 'join' || socialOnboardingFlow === 'parent') {
      return <Navigate to="/auth" replace />;
    }
    return <Navigate to="/activate-school" replace />;
  }
  if (profile?.status === 'pending' || profile?.status === 'rejected') return <Navigate to="/pending-approval" replace />;

  // Sub-page header with back button
  const isSubPage = !['home', 'weeklyplan', 'profile', 'live'].includes(activeTab);

  const renderMainContent = () => {
    switch (activeTab) {
      case 'home':
        return isDesktop ? (
          <div className="h-full overflow-hidden">
            <DesktopHome onNavigate={handleGridNavigate} hasSchool={!!school} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto pb-24">
            <StudentHomeGrid onNavigate={handleGridNavigate} hasSchool={!!school} />
            <div className="px-4">
              <TenantExtensionsSection />
            </div>
          </div>
        );

      case 'weeklyplan':
        return <WeeklyPlanSection />;

      case 'mindmaps':
        return <MindMapGenerator />;

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
      case 'studybuddy':
        return <StudyBuddy />;
      case 'goals':
        return <GoalTracker />;
      case 'leaderboard':
        return <Leaderboard />;
      case 'focustimer':
        return <FocusTimer />;
      case 'aiplans':
        return <AIStudyPlan />;
      case 'announcements':
        return <AnnouncementsViewer />;
      case 'trips':
        return <TripsViewer />;
      case 'graphcalc':
        return <GraphCalculator />;
      case 'live':
        return <StudentLiveList />;
      default:
        return null;
    }
  };

  const tabTitle = activeTab === 'sat' ? t('SAT Prep', 'تحضير SAT')
    : activeTab === 'mindmaps' ? t('Mind Maps', 'خرائط ذهنية')
    : activeTab === 'studybuddy' ? t('Lumina', 'لومينا')
    : activeTab === 'goals' ? t('My Goals', 'أهدافي')
    : activeTab === 'leaderboard' ? t('Leaderboard', 'المتصدرين')
    : activeTab === 'focustimer' ? t('Focus Timer', 'مؤقت التركيز')
    : activeTab === 'aiplans' ? t('AI Study Plan', 'خطة دراسة AI')
    : activeTab === 'subjects' ? t('Subjects', 'المواد')
    : activeTab === 'notes' ? t('Notes', 'الملاحظات')
    : activeTab === 'flashcards' ? t('Flashcards', 'البطاقات التعليمية')
    : activeTab === 'examination' ? t('Exams', 'الاختبارات')
    : activeTab === 'assignments' ? t('Assignments', 'الواجبات')
    : activeTab === 'reports' ? t('Report Cards', 'كشوف الدرجات')
    : activeTab === 'podcasts' ? t('AI Podcasts', 'بودكاست AI')
    : activeTab === 'announcements' ? t('Announcements', 'الإعلانات')
    : activeTab === 'trips' ? t('Trips', 'الرحلات')
    : activeTab === 'graphcalc' ? t('Graph Calculator', 'حاسبة الرسوم')
    : activeTab === 'weeklyplan' ? t('Weekly Plan', 'الخطة الأسبوعية')
    : activeTab === 'live' ? t('Live Rooms', 'الغرف المباشرة')
    : activeTab === 'profile' ? t('Profile', 'الملف الشخصي')
    : t('Home', 'الرئيسية');

  // Desktop gets the bento workspace; phones keep the circular home grid.
  if (isDesktop) {
    return (
      <>
        <AnimatedBackground />
        {activeTab !== 'focustimer' && (
          <FloatingTimer onNavigate={() => setActiveTab('focustimer')} />
        )}
        <DesktopShell
          activeTab={activeTab}
          onTabChange={setActiveTab}
          title={tabTitle}
          subtitle={
            profile?.full_name
              ? t(`Signed in as ${profile.full_name}`, `تم تسجيل الدخول باسم ${profile.full_name}`)
              : undefined
          }
        >
          <div className="h-full overflow-hidden">{renderMainContent()}</div>
        </DesktopShell>
      </>
    );
  }

  return (
    <div className="h-screen bg-background relative flex flex-col overflow-hidden">
      <AnimatedBackground />
      <LiquidField />

      {/* Persistent floating timer - shows when timer is active on any page except focustimer */}
      {activeTab !== 'focustimer' && (
        <FloatingTimer onNavigate={() => setActiveTab('focustimer')} />
      )}

      {/* Top bar - only show on sub-pages for back navigation */}
      {isSubPage && (
        <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-foreground/10 bg-background/45 backdrop-blur-2xl backdrop-saturate-150">
          <span aria-hidden className="liquid-hairline pointer-events-none absolute inset-x-6 -bottom-px opacity-70" />
          <div className="relative flex items-center h-full px-4 gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => setActiveTab('home')}>
              <ArrowLeft size={20} />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg overflow-hidden">
                <LuminaLogo size={28} />
              </div>
              <div className="min-w-0">
                <p className="liquid-label leading-none">{t('Lumina', 'لومينا')}</p>
                <span className="block font-display font-bold text-foreground text-sm truncate">{tabTitle}</span>
              </div>
            </div>
          </div>
        </header>
      )}


      {/* Draggable liquid lens — a physical shortcut you can park anywhere */}
      <LiquidLens
        storageKey="lumina.lens.student"
        label={t('Quick lens', 'العدسة السريعة')}
        actions={[
          { icon: Sparkles, label: t('Ask Lumina', 'اسأل لومينا'), onSelect: () => setActiveTab('studybuddy') },
          { icon: Timer, label: t('Focus timer', 'مؤقت التركيز'), onSelect: () => setActiveTab('focustimer') },
          { icon: NotebookPen, label: t('Notes', 'الملاحظات'), onSelect: () => setActiveTab('notes') },
          { icon: Map, label: t('Mind maps', 'خرائط ذهنية'), onSelect: () => setActiveTab('mindmaps') },
          { icon: Target, label: t('Goals', 'أهدافي'), onSelect: () => setActiveTab('goals') },
        ]}
      />

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
