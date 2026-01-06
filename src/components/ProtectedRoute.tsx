import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();  // single hook call
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if user is not logged in, but only after auth state resolves
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true, state: { from: location } });
    }
  }, [loading, user, navigate, location]);

  // Show loader while auth state is loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="ambient-glow" />
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // If user is not logged in, render nothing (redirect will happen via useEffect)
  if (!user) return null;

  // User is logged in, render protected content
  return <>{children}</>;
}
