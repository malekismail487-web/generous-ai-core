// -----------------------------------------------------------------------------
// Ministry Extension System — Blueprint DSL
// -----------------------------------------------------------------------------
// The Blueprint is the ONLY artifact Lumina can produce. It is a JSON manifest
// composed of allowlisted widgets, actions, and capabilities. Any request that
// names a protected system, references a real database table, or emits raw
// code fails validation before it ever reaches the queue. This is what makes
// tenant isolation structural rather than prompt-restricted.
// -----------------------------------------------------------------------------

import { z } from "zod";

// -----------------------------------------------------------------------------
// Allowlists
// -----------------------------------------------------------------------------

/** Widgets Lumina may compose into a surface. Nothing else renders. */
export const ALLOWED_WIDGETS = [
  "heading",
  "text",
  "stat",
  "table",
  "form",
  "list",
  "chart",
  "kanban",
] as const;
export type AllowedWidget = (typeof ALLOWED_WIDGETS)[number];

/** Capabilities a blueprint may request. */
export const ALLOWED_CAPABILITIES = [
  "data.read",
  "data.write",
  "file.upload",
  "notification.send",
  "export.csv",
] as const;

/** Roles a surface may target. */
export const ALLOWED_ROLES = [
  "student",
  "teacher",
  "parent",
  "school_admin",
  "ministry",
] as const;
export type SurfaceRole = (typeof ALLOWED_ROLES)[number];

/** Column types for tables / forms. */
export const ALLOWED_COLUMN_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
] as const;

// -----------------------------------------------------------------------------
// Protected keywords — Lumina must never name these. Enforced server-side
// after chat completion and again at deploy time.
// -----------------------------------------------------------------------------

export const PROTECTED_KEYWORDS = [
  "adaptive learning engine",
  "adaptive_learning_engine",
  "learning synchronization engine",
  "ability_estimates",
  "ensemble_predictions",
  "lesson_events",
  "kt_sequence_state",
  "fsrs_card_state",
  "auth.users",
  "user_roles",
  "hardcoded_admins",
  "super_admin",
  "tenant isolation",
  "tenants table",
  "ministry_sessions",
] as const;

/** Returns the first protected keyword mentioned in `text`, or null. */
export function findProtectedMention(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of PROTECTED_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Zod schemas
// -----------------------------------------------------------------------------

const columnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(ALLOWED_COLUMN_TYPES),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

const widgetSchema: z.ZodType<Widget> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("heading"), text: z.string() }),
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("stat"), label: z.string(), value: z.string() }),
    z.object({
      type: z.literal("table"),
      title: z.string(),
      dataKey: z.string(),
      columns: z.array(columnSchema),
    }),
    z.object({
      type: z.literal("form"),
      title: z.string(),
      dataKey: z.string(),
      submitLabel: z.string().default("Submit"),
      fields: z.array(columnSchema),
    }),
    z.object({
      type: z.literal("list"),
      title: z.string(),
      dataKey: z.string(),
      titleField: z.string(),
      subtitleField: z.string().optional(),
    }),
    z.object({
      type: z.literal("chart"),
      title: z.string(),
      dataKey: z.string(),
      xField: z.string(),
      yField: z.string(),
      kind: z.enum(["bar", "line"]),
    }),
    z.object({
      type: z.literal("kanban"),
      title: z.string(),
      dataKey: z.string(),
      titleField: z.string(),
      statusField: z.string(),
      statuses: z.array(z.string()),
    }),
  ]),
);

export const surfaceSchema = z.object({
  role: z.enum(ALLOWED_ROLES),
  title: z.string(),
  route: z
    .string()
    .regex(/^[a-z0-9\-/]+$/i, "route must be lowercase kebab-case"),
  widgets: z.array(widgetSchema).min(1),
});

export const dataStoreSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "dataKey must be snake_case"),
  columns: z.array(columnSchema).min(1),
});

export const manifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, "name must be snake_case"),
  displayName: z.string(),
  description: z.string(),
  surfaces: z.array(surfaceSchema).min(1),
  data: z.array(dataStoreSchema).default([]),
  permissions: z.object({
    read: z.array(z.enum(ALLOWED_ROLES)).min(1),
    write: z.array(z.enum(ALLOWED_ROLES)).default([]),
  }),
  capabilities_required: z.array(z.enum(ALLOWED_CAPABILITIES)).default([]),
});

// -----------------------------------------------------------------------------
// TypeScript types (mirrors the Zod schema, hand-written for lazy union safety)
// -----------------------------------------------------------------------------

export type Column = z.infer<typeof columnSchema>;

export type Widget =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "stat"; label: string; value: string }
  | { type: "table"; title: string; dataKey: string; columns: Column[] }
  | {
      type: "form";
      title: string;
      dataKey: string;
      submitLabel: string;
      fields: Column[];
    }
  | {
      type: "list";
      title: string;
      dataKey: string;
      titleField: string;
      subtitleField?: string;
    }
  | {
      type: "chart";
      title: string;
      dataKey: string;
      xField: string;
      yField: string;
      kind: "bar" | "line";
    }
  | {
      type: "kanban";
      title: string;
      dataKey: string;
      titleField: string;
      statusField: string;
      statuses: string[];
    };

export type ExtensionManifest = z.infer<typeof manifestSchema>;

// -----------------------------------------------------------------------------
// Public validation entry point
// -----------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  manifest?: ExtensionManifest;
  errors: string[];
  protectedMention?: string;
}

export function validateManifest(input: unknown): ValidationResult {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  const m = parsed.data;

  // Cross-reference: every widget.dataKey must exist in `data`
  const dataKeys = new Set(m.data.map((d) => d.key));
  const errors: string[] = [];
  for (const s of m.surfaces) {
    for (const w of s.widgets) {
      if ("dataKey" in w && !dataKeys.has(w.dataKey)) {
        errors.push(
          `surface "${s.title}" widget references unknown dataKey "${w.dataKey}"`,
        );
      }
    }
  }

  // Scan free-form text for protected mentions
  const scanText = [
    m.displayName,
    m.description,
    ...m.surfaces.flatMap((s) => [
      s.title,
      ...s.widgets.flatMap((w) => {
        if (w.type === "heading" || w.type === "text") return [w.text];
        if (w.type === "stat") return [w.label, w.value];
        return "title" in w ? [w.title] : [];
      }),
    ]),
  ].join(" \n ");
  const protectedMention = findProtectedMention(scanText);
  if (protectedMention) {
    errors.push(
      `blueprint mentions protected system "${protectedMention}" — refusal required`,
    );
  }

  if (errors.length > 0) return { ok: false, errors, protectedMention: protectedMention ?? undefined };
  return { ok: true, manifest: m, errors: [] };
}

/** Minimal placeholder manifest used before Lumina responds. */
export function emptyManifest(name = "new_extension"): ExtensionManifest {
  return {
    name,
    displayName: "New Extension",
    description: "",
    surfaces: [
      {
        role: "student",
        title: "Home",
        route: name.replace(/_/g, "-"),
        widgets: [{ type: "heading", text: "New Extension" }],
      },
    ],
    data: [],
    permissions: { read: ["student"], write: [] },
    capabilities_required: [],
  };
}
