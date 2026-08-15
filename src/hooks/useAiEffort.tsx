import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  AI_EFFORT_DEFAULT,
  AI_EFFORT_GLOBAL_KEY,
  AiEffort,
  aiEffortSurfaceKey,
  effortSpec,
  isAiEffort,
} from '@/lib/aiEffort';

interface AiEffortContextValue {
  /** The workspace-wide default the student picked in their profile. */
  globalEffort: AiEffort;
  setGlobalEffort: (effort: AiEffort) => void;
  /** Per-surface overrides, keyed by surface id. */
  overrides: Record<string, AiEffort>;
  setSurfaceEffort: (surface: string, effort: AiEffort | null) => void;
}

const AiEffortContext = createContext<AiEffortContextValue | undefined>(undefined);

function readGlobal(): AiEffort {
  if (typeof window === 'undefined') return AI_EFFORT_DEFAULT;
  const saved = window.localStorage.getItem(AI_EFFORT_GLOBAL_KEY);
  return isAiEffort(saved) ? saved : AI_EFFORT_DEFAULT;
}

export function AiEffortProvider({ children }: { children: ReactNode }) {
  const [globalEffort, setGlobalEffortState] = useState<AiEffort>(readGlobal);
  const [overrides, setOverrides] = useState<Record<string, AiEffort>>({});

  const setGlobalEffort = useCallback((effort: AiEffort) => {
    setGlobalEffortState(effort);
    localStorage.setItem(AI_EFFORT_GLOBAL_KEY, effort);
  }, []);

  const setSurfaceEffort = useCallback((surface: string, effort: AiEffort | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (effort === null) {
        delete next[surface];
        localStorage.removeItem(aiEffortSurfaceKey(surface));
      } else {
        next[surface] = effort;
        localStorage.setItem(aiEffortSurfaceKey(surface), effort);
      }
      return next;
    });
  }, []);

  // Hydrate any surface overrides that were saved in a previous session.
  useEffect(() => {
    const hydrated: Record<string, AiEffort> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${AI_EFFORT_GLOBAL_KEY}:`)) continue;
      const value = localStorage.getItem(key);
      if (isAiEffort(value)) hydrated[key.slice(AI_EFFORT_GLOBAL_KEY.length + 1)] = value;
    }
    if (Object.keys(hydrated).length) setOverrides(hydrated);
  }, []);

  const value = useMemo(
    () => ({ globalEffort, setGlobalEffort, overrides, setSurfaceEffort }),
    [globalEffort, setGlobalEffort, overrides, setSurfaceEffort],
  );

  return <AiEffortContext.Provider value={value}>{children}</AiEffortContext.Provider>;
}

function useAiEffortContext(): AiEffortContextValue {
  const ctx = useContext(AiEffortContext);
  if (ctx) return ctx;
  // Graceful fallback so an AI surface rendered outside the provider still works.
  return {
    globalEffort: readGlobal(),
    setGlobalEffort: () => undefined,
    overrides: {},
    setSurfaceEffort: () => undefined,
  };
}

/**
 * Resolve the effort tier for one AI surface.
 *
 * Pass a surface id (e.g. "study-buddy") to get its override when one exists,
 * falling back to the student's global default.
 */
export function useAiEffort(surface?: string) {
  const { globalEffort, setGlobalEffort, overrides, setSurfaceEffort } = useAiEffortContext();

  const override = surface ? overrides[surface] : undefined;
  const effort: AiEffort = override ?? globalEffort;

  const setEffort = useCallback(
    (next: AiEffort) => {
      if (surface) setSurfaceEffort(surface, next === globalEffort ? null : next);
      else setGlobalEffort(next);
    },
    [surface, globalEffort, setSurfaceEffort, setGlobalEffort],
  );

  return {
    effort,
    spec: effortSpec(effort),
    isOverridden: Boolean(override),
    setEffort,
    resetToGlobal: () => surface && setSurfaceEffort(surface, null),
    globalEffort,
    setGlobalEffort,
  };
}
