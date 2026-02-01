import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-950 text-red-50">
      <div className="max-w-md p-8 rounded-2xl bg-red-900/60 border border-red-600 text-center space-y-6">
        <h1 className="text-3xl font-bold">Access Denied</h1>
        <p className="text-sm text-red-100">
          You do not have permission to view this page.
        </p>
        <Button
          variant="outline"
          className="border-red-400"
          onClick={() => navigate("/")}
        >
          Go back
        </Button>
      </div>
    </div>
  );
}
