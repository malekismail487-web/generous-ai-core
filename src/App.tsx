import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { FocusTimerProvider } from "@/hooks/useFocusTimer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeLanguageProvider } from "@/hooks/useThemeLanguage";
import { WallpaperProvider } from "@/hooks/useWallpaper";
import DeviceBanScreen from "@/components/DeviceBanScreen";
import LCTExamGuard from "@/components/LCTExamGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LanguageSelect from "./pages/LanguageSelect";
import CountrySelect from "./pages/CountrySelect";
import NotFound from "./pages/NotFound";
import SuperAdmin from "./pages/SuperAdmin";
import ParentDashboard from "./pages/ParentDashboard";
import SuperAdminVerify from "./pages/SuperAdminVerify";
import ActivateSchool from "./pages/ActivateSchool";
import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import StudentAssignmentTake from "./pages/StudentAssignmentTake";
import StudentAssignmentResults from "./pages/StudentAssignmentResults";

import IQTest from "./pages/IQTest";
import MinistryLogin from "./pages/MinistryLogin";
import MinistryDashboard from "./pages/MinistryDashboard";
import MinistryPending from "./pages/MinistryPending";
import MinistryAccessAlert from "./components/MinistryAccessAlert";
import { AdaptiveDiagnosticsPanel } from "./components/student/AdaptiveDiagnosticsPanel";
import ModeratorDashboard from "./pages/ModeratorDashboard";
import ModeratorPendingPage from "./pages/ModeratorPending";
import CodeLab from "./pages/CodeLab";
import LseBench from "./pages/LseBench";
import TeacherLiveConsole from "./pages/TeacherLiveConsole";
import StudentLiveRoom from "./pages/StudentLiveRoom";

const queryClient = new QueryClient();

// Gate: every new tab must go through /language then /country before /auth.
// Once authenticated, both selections are no-ops — the country is determined by
// the user's tenant (profile.school_id → schools.tenant_id).
function LanguageGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const hasLanguage = sessionStorage.getItem('language-selected-tab');
  const hasCountry = sessionStorage.getItem('selected_tenant_id');

  // Always allow the selection pages through.
  if (location.pathname === '/language' || location.pathname === '/country') {
    return <>{children}</>;
  }

  if (!hasLanguage) return <Navigate to="/language" replace />;

  // Country selection is a pre-auth gate. Once the user is signed in the
  // tenant is derived server-side, so we only gate the unauthenticated funnel
  // (auth / activate-school / ministry entry).
  const preAuthRoutes = ['/auth', '/activate-school', '/ministry'];
  if (!hasCountry && preAuthRoutes.includes(location.pathname)) {
    return <Navigate to="/country" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <DeviceBanScreen>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeLanguageProvider>
          <WallpaperProvider>
          <FocusTimerProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <MinistryAccessAlert />
              <AdaptiveDiagnosticsPanel />
              
              <BrowserRouter>
                <LCTExamGuard>
                <LanguageGate>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/language" element={<LanguageSelect />} />
                    <Route path="/country" element={<CountrySelect />} />
                    <Route path="/super-admin" element={<SuperAdmin />} />
                    <Route path="/super-admin-verify" element={<SuperAdminVerify />} />
                    <Route path="/parent" element={<ParentDashboard />} />
                    <Route path="/activate-school" element={<ActivateSchool />} />
                    <Route path="/admin" element={<SchoolAdminDashboard />} />
                    <Route path="/teacher" element={<TeacherDashboard />} />
                    <Route path="/student" element={<Navigate to="/" replace />} />
                    <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentTake />} />
                    <Route
                      path="/student/assignments/:assignmentId/results"
                      element={<StudentAssignmentResults />}
                    />
                    <Route path="/pending-approval" element={<PendingApprovalPage />} />
                    
                    <Route path="/iq-test" element={<IQTest />} />
                    <Route path="/ministry" element={<MinistryLogin />} />
                    <Route path="/ministry-pending" element={<MinistryPending />} />
                    <Route path="/ministry-dashboard" element={<MinistryDashboard />} />
                    <Route path="/moderator" element={<ModeratorDashboard />} />
                    <Route path="/moderator-pending" element={<ModeratorPendingPage />} />
                    <Route path="/code-lab" element={<CodeLab />} />
                    <Route path="/lse-bench" element={<LseBench />} />
                    <Route path="/teacher/live" element={<TeacherLiveConsole />} />
                    <Route path="/live/:meetingId" element={<StudentLiveRoom />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </LanguageGate>
                </LCTExamGuard>
              </BrowserRouter>
            </TooltipProvider>
          </FocusTimerProvider>
          </WallpaperProvider>
        </ThemeLanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  </DeviceBanScreen>
);

export default App;
