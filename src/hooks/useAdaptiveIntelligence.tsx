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

import { useCallback, useRef } from 'react';
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

/** Cached profile to avoid re-fetching within 60 seconds */
interface CachedProfile {
  profile: StudentIntelligenceProfile;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds

// Module-level cache shared across hook instances (per page load)
const profileCache: Record<string, CachedProfile> = {};

/**
 * Returns the full adaptive intelligence API for any component.
 */
export function useAdaptiveIntelligence() {
  const { user } = useAuth();
  const pendingRef = useRef<Promise<any> | null>(null);

  /**
   * Get the FULL adaptive context with all 7 subsystem outputs.
   * Returns { adaptiveLevel, learningStyle (= full context string), fullContext, profile }.
   * 
   * The `learningStyle` field IS the full context string — this is by design so that
   * components using the simple `streamChat({ adaptiveLevel, learningStyle })` pattern
   * automatically get all subsystem intelligence injected.
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

    // Deduplicate concurrent calls
    if (pendingRef.current) {
      try {
        await pendingRef.current;
      } catch { /* ignore */ }
    }

    const promise = generateAdaptiveContext(userId, feature, subject);
    pendingRef.current = promise;

    try {
      const result = await promise;
      // Cache the profile
      profileCache[userId] = {
        profile: result.profile,
        timestamp: Date.now(),
      };
      return result;
    } finally {
      pendingRef.current = null;
    }
  }, [user?.id]);

  /**
   * Lightweight version — returns just { adaptiveLevel, learningStyle } strings.
   * Use this when you only need to pass params to streamChat or an edge function.
   */
  const getSimpleParams = useCallback(async (
    feature: FeatureType,
    subject?: string,
  ): Promise<{ adaptiveLevel: string; learningStyle: string }> => {
    const userId = user?.id;
    if (!userId) return { adaptiveLevel: 'intermediate', learningStyle: '' };
    return getSimpleAdaptiveParams(userId, feature, subject);
  }, [user?.id]);

  /**
   * Record a quiz/practice/exam answer with FULL subsystem integration.
   * This feeds into ALL 7 subsystems simultaneously:
   *   1. DB (student_answer_history)
   *   2. Spaced Repetition engine
   *   3. Mistake Analyzer
   *   4. Cognitive Model
   *   5. Emotional State Engine
   *   6. Predictive Engine
   *   7. Knowledge Gap tracker
   */
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
      await recordIntelligentAnswer({
        userId,
        ...params,
      });
    } catch (err) {
      console.warn('[AdaptiveIntelligence] recordAnswer error:', err);
    }
  }, [user?.id]);

  /**
   * Record a chat message for emotional analysis + cognitive tracking.
   * Call this on every user message in any chat context.
   */
  const recordChat = useCallback((messageText: string) => {
    recordChatMessage(messageText);
  }, []);

  /**
   * Record study activity (viewing a lecture, generating notes, etc.)
   */
  const recordActivity = useCallback((params: {
    subject: string;
    topic: string;
    feature: FeatureType;
    durationEstimate?: number;
  }) => {
    recordStudyActivity(params);
  }, []);

  /**
   * Get items that are due for spaced repetition review.
   */
  const getDueItems = useCallback((subject?: string) => {
    return getDueReviewItems(subject);
  }, []);

  /**
   * Get the cached profile if available and fresh.
   */
  const getCachedProfile = useCallback((): StudentIntelligenceProfile | null => {
    const userId = user?.id;
    if (!userId) return null;
    const cached = profileCache[userId];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.profile;
    }
    return null;
  }, [user?.id]);

  return {
    getContext,
    getSimpleParams,
    recordAnswer,
    recordChat,
    recordActivity,
    getDueItems,
    getCachedProfile,
    userId: user?.id || null,
  };
}
