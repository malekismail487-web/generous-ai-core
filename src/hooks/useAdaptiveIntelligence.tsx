/**
 * useAdaptiveIntelligence.tsx
 * 
 * Unified React hook that connects the full 1,434-line Adaptive Intelligence Engine
 * to every AI-powered component in the app. This is the "nervous system" that bridges
 * the engine's brain to the app's UI.
 * 
 * Every AI feature calls this hook to:
 *   1. GET full adaptive context (all 7 subsystems) for prompt injection
 *   2. RECORD interactions (answers, chat messages, study activity) into all subsystems
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────┐
 * │            useAdaptiveIntelligence               │
 * │  ┌──────────┐  ┌────────────┐  ┌─────────────┐ │
 * │  │getContext │  │recordAnswer│  │ recordChat  │ │
 * │  │          │  │            │  │             │ │
 * │  │ Builds   │  │ Feeds 7    │  │ Feeds       │ │
 * │  │ profile, │  │ subsystems │  │ emotional + │ │
 * │  │ runs 7   │  │ + DB +     │  │ cognitive   │ │
 * │  │ engines, │  │ knowledge  │  │ models      │ │
 * │  │ returns  │  │ gaps       │  │             │ │
 * │  │ context  │  │            │  │             │ │
 * │  └──────────┘  └────────────┘  └─────────────┘ │
 * │       ↕              ↕              ↕           │
 * │  ┌──────────────────────────────────────────┐   │
 * │  │     adaptiveIntelligence.ts (1,434 lines)│   │
 * │  │  7 subsystems: Cognitive, SpacedRep,     │   │
 * │  │  Mistakes, Predictive, Emotional,        │   │
 * │  │  ConceptGraph, RuleGenerator             │   │
 * │  └──────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────┘
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  generateAdaptiveContext,
  getSimpleAdaptiveParams,
  recordIntelligentAnswer,
  recordChatMessage,
  recordStudyActivity,
  recordTeachingEvent,
  getDueReviewItems,
  type FeatureType,
  type StudentIntelligenceProfile,
} from '@/lib/adaptiveIntelligence';
import {
  bumpProfile,
  subscribeProfileVersion,
  getProfileVersion,
  type BumpReason,
} from '@/lib/adaptiveProfileBus';

/** Cached profile entry — TTL acts as a safety net; the bus drives invalidation. */
interface CachedProfile {
  profile: StudentIntelligenceProfile;
  timestamp: number;
  version: number;
}

// Phase 3: dropped from 60s → 15s. The profile bus invalidates on event,
// so the TTL only protects against stale data when no signals fire.
const CACHE_TTL_MS = 15_000;

// Module-level cache shared across hook instances (per page load)
const profileCache: Record<string, CachedProfile> = {};

/**
 * Returns the full adaptive intelligence API for any component.
 */
export function useAdaptiveIntelligence() {
  const { user } = useAuth();
  const pendingRef = useRef<Promise<any> | null>(null);

  // Phase 3: subscribe to the bus so any component using this hook re-renders
  // when an event-driven invalidation fires (3+ wrong, strong emotion, etc).
  const profileVersion = useSyncExternalStore(
    subscribeProfileVersion,
    getProfileVersion,
    getProfileVersion,
  );

  /** Read cached profile if it's both fresh AND matches the current bus version. */
  const readCache = useCallback((userId: string): StudentIntelligenceProfile | null => {
    const c = profileCache[userId];
    if (!c) return null;
    if (c.version !== profileVersion) return null;
    if (Date.now() - c.timestamp >= CACHE_TTL_MS) return null;
    return c.profile;
  }, [profileVersion]);

  /**
   * Get the FULL adaptive context with all 7 subsystem outputs.
   * Returns { adaptiveLevel, learningStyle (= full context string), fullContext, profile }.
   */
  const getContext = useCallback(async (
    feature: FeatureType,
    subject?: string,
  ): Promise<{
    adaptiveLevel: string;
    learningStyle: string;
    fullContext: string;
    profile: StudentIntelligenceProfile;
  }> => {
    const userId = user?.id;
    if (!userId) {
      return {
        adaptiveLevel: 'intermediate',
        learningStyle: '',
        fullContext: '',
        profile: {} as StudentIntelligenceProfile,
      };
    }

    if (pendingRef.current) {
      try { await pendingRef.current; } catch { /* ignore */ }
    }

    const promise = generateAdaptiveContext(userId, feature, subject);
    pendingRef.current = promise;

    try {
      const result = await promise;
      profileCache[userId] = {
        profile: result.profile,
        timestamp: Date.now(),
        version: profileVersion,
      };
      return result;
    } finally {
      pendingRef.current = null;
    }
  }, [user?.id, profileVersion]);

  const getSimpleParams = useCallback(async (
    feature: FeatureType,
    subject?: string,
  ): Promise<{ adaptiveLevel: string; learningStyle: string }> => {
    const userId = user?.id;
    if (!userId) return { adaptiveLevel: 'intermediate', learningStyle: '' };
    return getSimpleAdaptiveParams(userId, feature, subject);
  }, [user?.id]);

  const recordAnswer = useCallback(async (params: {
    subject: string;
    questionText: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    difficulty: string;
    source: string;
    responseTimeSec?: number;
  }) => {
    const userId = user?.id;
    if (!userId) return;
    try {
      await recordIntelligentAnswer({ userId, ...params });
    } catch (err) {
      console.warn('[AdaptiveIntelligence] recordAnswer error:', err);
    }
  }, [user?.id]);

  const recordChat = useCallback((messageText: string) => {
    recordChatMessage(messageText);
  }, []);

  const recordActivity = useCallback((params: {
    subject: string;
    topic: string;
    feature: FeatureType;
    durationEstimate?: number;
  }) => {
    recordStudyActivity(params);
  }, []);

  const getDueItems = useCallback((subject?: string) => {
    return getDueReviewItems(subject);
  }, []);

  const recordTeaching = useCallback((params: {
    topic: string;
    subject: string;
    feature: string;
    content?: string;
  }) => {
    recordTeachingEvent(params);
  }, []);

  const getCachedProfile = useCallback((): StudentIntelligenceProfile | null => {
    const userId = user?.id;
    if (!userId) return null;
    return readCache(userId);
  }, [user?.id, readCache]);

  /** Phase 3 — explicit manual invalidation. Most callers don't need this. */
  const invalidateProfile = useCallback((reason: BumpReason = 'manual', detail?: string) => {
    bumpProfile(reason, detail);
  }, []);

  return {
    getContext,
    getSimpleParams,
    recordAnswer,
    recordChat,
    recordActivity,
    getDueItems,
    recordTeaching,
    getCachedProfile,
    invalidateProfile,
    profileVersion,
    userId: user?.id || null,
  };
}

