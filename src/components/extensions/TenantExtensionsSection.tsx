// -----------------------------------------------------------------------------
// Compact mount point that shows this tenant's active deployed extensions.
// Drop into any dashboard where you want approved ministry extensions to appear.
// -----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";

interface ActiveVersion {
  version_id: string;
  name: string;
  version: number;
  manifest: { displayName?: string; description?: string };
  deployed_at: string;
}

export function TenantExtensionsSection() {
  const [items, setItems] = useState<ActiveVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      // deno-lint-ignore no-explicit-any
      const sb: any = supabase;
      const { data, error } = await sb.rpc("ext_list_active_for_me");
      if (!alive) return;
      if (!error) setItems((data ?? []) as ActiveVersion[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Ministry Extensions</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((x) => (
          <Link
            key={x.version_id}
            to={`/extensions/${x.version_id}`}
            className="rounded-lg border bg-card hover:border-primary transition-colors p-3 flex flex-col gap-1"
          >
            <p className="text-sm font-medium">{x.manifest?.displayName ?? x.name}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {x.manifest?.description ?? "Extension deployed by your ministry."}
            </p>
            <span className="text-[10px] text-primary mt-auto flex items-center gap-1">
              Open <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
