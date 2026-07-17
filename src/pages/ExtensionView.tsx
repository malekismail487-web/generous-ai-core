// -----------------------------------------------------------------------------
// /extensions/:versionId — a single deployed extension, rendered by role
// -----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ExtensionRenderer } from "@/components/extensions/ExtensionRenderer";
import { validateManifest, type ExtensionManifest, type SurfaceRole } from "@/lib/extensions/blueprint";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

interface ActiveVersion {
  version_id: string;
  name: string;
  version: number;
  manifest: unknown;
  deployed_at: string;
}

export default function ExtensionView() {
  const { versionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<ActiveVersion | null>(null);
  const [role, setRole] = useState<SurfaceRole>("student");
  const [tenantId, setTenantId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      // Discover role from profile
      const { data: profile } = await supabase
        .from("profiles").select("role, school_id").eq("id", user.id).maybeSingle();
      if (profile?.role && ["student","teacher","parent","school_admin","ministry"].includes(profile.role)) {
        setRole(profile.role as SurfaceRole);
      }
      if (profile?.school_id) {
        const { data: school } = await supabase
          .from("schools").select("tenant_id").eq("id", profile.school_id).maybeSingle();
        if (school?.tenant_id) setTenantId(school.tenant_id);
      }

      const { data, error } = await supabase.rpc("ext_list_active_for_me");
      if (!alive) return;
      if (error) { setLoading(false); return; }
      const found = ((data ?? []) as ActiveVersion[]).find((v) => v.version_id === versionId);
      setVersion(found ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [versionId, navigate]);

  if (loading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }
  if (!version) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">This extension is not available for your account.</p>
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      </div>
    );
  }

  const validation = validateManifest(version.manifest);
  const manifest: ExtensionManifest | null = validation.ok ? validation.manifest ?? null : null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Button variant="ghost" onClick={() => navigate(-1)} size="sm" className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Button>
      {manifest ? (
        <ExtensionRenderer
          manifest={manifest}
          role={role}
          versionId={version.version_id}
          tenantId={tenantId}
        />
      ) : (
        <div className="text-sm text-destructive">Extension manifest failed validation.</div>
      )}
    </div>
  );
}
