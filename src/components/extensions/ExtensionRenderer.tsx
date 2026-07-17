// -----------------------------------------------------------------------------
// Ministry Extension System — Runtime Interpreter
// -----------------------------------------------------------------------------
// Reads a validated ExtensionManifest and renders it using only allowlisted
// widgets. There is no eval, no dynamic import, no raw SQL. Data reads/writes
// go through `useExtensionData`, which is scoped to a version_id + table_key
// and gated by RLS to the caller's tenant.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  ExtensionManifest,
  Widget,
  Column,
  SurfaceRole,
} from "@/lib/extensions/blueprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Row {
  id: string;
  row: Record<string, unknown>;
  owner_user_id: string | null;
}

interface DataSource {
  read: (dataKey: string) => Promise<Row[]>;
  write: (dataKey: string, row: Record<string, unknown>) => Promise<void>;
}

// -----------------------------------------------------------------------------
// Data sources — the real one (deployed) and the sandbox one (preview)
// -----------------------------------------------------------------------------

// Extension tables aren't in the generated Supabase types yet — cast the client.
// deno-lint-ignore no-explicit-any
const sb: any = supabase;

function useDeployedDataSource(versionId: string, tenantId: string): DataSource {
  return useMemo(
    () => ({
      async read(dataKey) {
        const { data, error } = await sb
          .from("extension_data")
          .select("id, row, owner_user_id")
          .eq("version_id", versionId)
          .eq("table_key", dataKey)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Row[];
      },
      async write(dataKey, row) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await sb.from("extension_data").insert({
          version_id: versionId,
          tenant_id: tenantId,
          table_key: dataKey,
          owner_user_id: user?.id ?? null,
          row,
        });
        if (error) throw error;
      },
    }),
    [versionId, tenantId],
  );
}

function useSandboxDataSource(blueprintId: string, tenantId: string): DataSource {
  return useMemo(
    () => ({
      async read(dataKey) {
        const { data, error } = await sb
          .from("extension_sandbox_data")
          .select("id, row")
          .eq("blueprint_id", blueprintId)
          .eq("table_key", dataKey)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map((r: { id: string; row: Record<string, unknown> }) => ({
          id: r.id, row: r.row, owner_user_id: null,
        }));
      },
      async write(dataKey, row) {
        const { error } = await sb.from("extension_sandbox_data").insert({
          blueprint_id: blueprintId,
          tenant_id: tenantId,
          table_key: dataKey,
          row,
        });
        if (error) throw error;
      },
    }),
    [blueprintId, tenantId],
  );
}

// -----------------------------------------------------------------------------
// Widget renderers
// -----------------------------------------------------------------------------

function WidgetRenderer({
  widget,
  data,
}: {
  widget: Widget;
  data: DataSource;
}) {
  switch (widget.type) {
    case "heading":
      return <h2 className="text-xl font-semibold text-foreground">{widget.text}</h2>;
    case "text":
      return <p className="text-sm text-muted-foreground leading-relaxed">{widget.text}</p>;
    case "stat":
      return (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{widget.label}</p>
          <p className="text-2xl font-semibold text-foreground">{widget.value}</p>
        </div>
      );
    case "table":
      return <TableWidget widget={widget} data={data} />;
    case "form":
      return <FormWidget widget={widget} data={data} />;
    case "list":
      return <ListWidget widget={widget} data={data} />;
    case "chart":
      return <ChartWidget widget={widget} data={data} />;
    case "kanban":
      return <KanbanWidget widget={widget} data={data} />;
  }
}

function useRows(data: DataSource, dataKey: string) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    data
      .read(dataKey)
      .then((r) => alive && setRows(r))
      .catch((e) => console.error("[ExtensionRenderer]", e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [data, dataKey, reloadCounter]);
  return { rows, loading, reload: () => setReloadCounter((n) => n + 1) };
}

function TableWidget({
  widget,
  data,
}: {
  widget: Extract<Widget, { type: "table" }>;
  data: DataSource;
}) {
  const { rows, loading } = useRows(data, widget.dataKey);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-sm font-medium">{widget.title}</div>
      <Table>
        <TableHeader>
          <TableRow>
            {widget.columns.map((c) => (
              <TableHead key={c.key}>{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={widget.columns.length} className="text-center text-muted-foreground text-sm py-6">
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={widget.columns.length} className="text-center text-muted-foreground text-sm py-6">
                No entries yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                {widget.columns.map((c) => (
                  <TableCell key={c.key} className="text-sm">
                    {String(r.row[c.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FormWidget({
  widget,
  data,
}: {
  widget: Extract<Widget, { type: "form" }>;
  data: DataSource;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const row: Record<string, unknown> = {};
      for (const f of widget.fields) {
        const v = values[f.key] ?? "";
        if (f.required && !v) {
          toast({ title: `${f.label} is required`, variant: "destructive" });
          setSubmitting(false);
          return;
        }
        row[f.key] =
          f.type === "number"
            ? Number(v)
            : f.type === "boolean"
              ? v === "true"
              : v;
      }
      await data.write(widget.dataKey, row);
      toast({ title: "Saved" });
      setValues({});
    } catch (e: unknown) {
      toast({
        title: "Failed to save",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">{widget.title}</p>
      {widget.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={values[f.key] ?? ""}
          onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
        />
      ))}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "Saving…" : widget.submitLabel}
      </Button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Column;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {field.label}
        {field.required ? " *" : ""}
      </Label>
      {field.type === "select" && field.options?.length ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <Input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ListWidget({
  widget,
  data,
}: {
  widget: Extract<Widget, { type: "list" }>;
  data: DataSource;
}) {
  const { rows, loading } = useRows(data, widget.dataKey);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-sm font-medium">{widget.title}</div>
      <div className="divide-y divide-border">
        {loading ? (
          <div className="text-center text-muted-foreground text-sm py-6">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-6">Nothing yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="px-4 py-2">
              <p className="text-sm font-medium">{String(r.row[widget.titleField] ?? "—")}</p>
              {widget.subtitleField && (
                <p className="text-xs text-muted-foreground">
                  {String(r.row[widget.subtitleField] ?? "")}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChartWidget({
  widget,
  data,
}: {
  widget: Extract<Widget, { type: "chart" }>;
  data: DataSource;
}) {
  const { rows, loading } = useRows(data, widget.dataKey);
  const points = rows.map((r) => ({
    x: String(r.row[widget.xField] ?? ""),
    y: Number(r.row[widget.yField] ?? 0),
  }));
  const max = Math.max(1, ...points.map((p) => p.y));
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium mb-3">{widget.title}</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : points.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {points.map((p, i) => (
            <div key={i} className="flex flex-col items-center flex-1">
              <div
                className="w-full bg-primary/70 rounded-t"
                style={{ height: `${(p.y / max) * 100}%` }}
                title={`${p.x}: ${p.y}`}
              />
              <p className="text-[10px] text-muted-foreground truncate w-full text-center mt-1">
                {p.x}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanWidget({
  widget,
  data,
}: {
  widget: Extract<Widget, { type: "kanban" }>;
  data: DataSource;
}) {
  const { rows, loading } = useRows(data, widget.dataKey);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium mb-3">{widget.title}</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {widget.statuses.map((s) => {
            const cards = rows.filter((r) => r.row[widget.statusField] === s);
            return (
              <div key={s} className="rounded border border-border bg-background p-2">
                <p className="text-xs uppercase text-muted-foreground mb-2">
                  {s} ({cards.length})
                </p>
                <div className="space-y-1">
                  {cards.map((c) => (
                    <div key={c.id} className="text-xs bg-card border border-border rounded px-2 py-1">
                      {String(c.row[widget.titleField] ?? "—")}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main renderer
// -----------------------------------------------------------------------------

interface RendererProps {
  manifest: ExtensionManifest;
  /** Which role's surface to display (defaults to first surface). */
  role?: SurfaceRole;
  /** Deployed extension version — reads/writes go to `extension_data`. */
  versionId?: string;
  /** Preview mode — reads/writes go to `extension_sandbox_data`. */
  blueprintId?: string;
  tenantId: string;
}

export function ExtensionRenderer({
  manifest,
  role,
  versionId,
  blueprintId,
  tenantId,
}: RendererProps) {
  const surface = useMemo(() => {
    if (role) return manifest.surfaces.find((s) => s.role === role) ?? manifest.surfaces[0];
    return manifest.surfaces[0];
  }, [manifest, role]);

  const deployed = useDeployedDataSource(versionId ?? "", tenantId);
  const sandbox = useSandboxDataSource(blueprintId ?? "", tenantId);
  const dataSource = versionId ? deployed : sandbox;

  if (!surface) {
    return <p className="text-sm text-muted-foreground">No surface for this role.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {manifest.displayName} · {surface.role}
        </p>
        <h1 className="text-lg font-semibold">{surface.title}</h1>
      </div>
      <div className="space-y-3">
        {surface.widgets.map((w, i) => (
          <WidgetRenderer key={i} widget={w} data={dataSource} />
        ))}
      </div>
    </div>
  );
}
