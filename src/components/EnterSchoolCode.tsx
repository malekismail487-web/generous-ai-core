import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { claimSchoolCode } from "@/lib/educationApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EnterSchoolCode() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !code.trim()) return;

    setLoading(true);
    try {
      const result = await claimSchoolCode(code.toUpperCase());
      if (!result.success) {
        toast({
          title: "Activation failed",
          description: result.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "School activated",
        description: You are now admin of ${result.school?.name},
      });
    } finally {
      setLoading(false);
      setCode("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-8 border rounded-xl space-y-4"
      >
        <h1 className="text-xl font-bold text-center">Activate School</h1>

        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="School code"
          maxLength={12}
          className="text-center font-mono tracking-widest"
        />

        <Button className="w-full" disabled={loading}>
          {loading ? "Activating..." : "Activate"}
        </Button>
      </form>
    </div>
  );
}
