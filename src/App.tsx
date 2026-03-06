import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { FocusTimerProvider } from "@/hooks/useFocusTimer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeLanguageProvider } from "@/hooks/useThemeLanguage";
import { WallpaperProvider } from "@/hooks/useWallpaper";
import DeviceBanScreen from "@/components/DeviceBanScreen";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LanguageSelect from "./pages/LanguageSelect";
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
import ModeratorDashboard from "./pages/ModeratorDashboard";
import ModeratorPendingPage from "./pages/ModeratorPending";

const queryClient = new QueryClient();

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
              
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/language" element={<LanguageSelect />} />
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
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
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
