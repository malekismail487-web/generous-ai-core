import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeLanguageProvider } from "@/hooks/useThemeLanguage";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminVerify from "./pages/SuperAdminVerify";
import ActivateSchool from "./pages/ActivateSchool";
import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import StudentAssignmentTake from "./pages/StudentAssignmentTake";
import StudentAssignmentResults from "./pages/StudentAssignmentResults";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeLanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/super-admin" element={<SuperAdmin />} />
              <Route path="/super-admin-verify" element={<SuperAdminVerify />} />
              <Route path="/activate-school" element={<ActivateSchool />} />
              <Route path="/admin" element={<SchoolAdminDashboard />} />
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/assignments/:assignmentId" element={<StudentAssignmentTake />} />
              <Route
                path="/student/assignments/:assignmentId/results"
                element={<StudentAssignmentResults />}
              />
              <Route path="/pending-approval" element={<PendingApprovalPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeLanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
