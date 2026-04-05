/**
 * emotionalStateEngine.ts — Emotional State Machine & Motivation Tracker
 * =======================================================================
 * 
 * Tracks the student's emotional state over time using behavioral signals
 * to model:
 * - Current emotional state (frustrated, confused, bored, excited, etc.)
 * - Motivation curve (trending up or down)
 * - Engagement intensity
 * - Frustration tolerance (how much difficulty they can handle)
 * - Confidence level
 * 
 * State Machine:
 * ┌───────────┐   success    ┌──────────┐
 * │ NEUTRAL   ├─────────────→│ EXCITED  │
 * └─────┬─────┘              └─────┬────┘
 *       │ errors                   │ plateau
 *       ▼                          ▼
 * ┌───────────┐              ┌──────────┐
 * │ CONFUSED  │              │  BORED   │
 * └─────┬─────┘              └──────────┘
 *       │ repeated errors
 *       ▼
 * ┌───────────┐
 * │FRUSTRATED │
 * └───────────┘
 * 
 * The engine adapts AI tone, pacing, and encouragement based on
 * the detected emotional state.
 */

// ============================================================================
//  TYPES
// ============================================================================

export type EmotionalState = 
  | 'neutral'
  | 'excited'
  | 'confident'
  | 'curious'
  | 'confused'
  | 'frustrated'
  | 'bored'
  | 'anxious'
  | 'discouraged'
  | 'determined';

export interface EmotionalProfile {
  /** Current primary emotional state */
  currentState: EmotionalState;
  /** Secondary state (can co-exist, e.g., frustrated + determined) */
  secondaryState: EmotionalState | null;
  /** Confidence in the emotional assessment (0-100) */
  confidence: number;
  /** Motivation level (0-100) */
  motivationLevel: number;
  /** Motivation trend */
  motivationTrend: 'rising' | 'stable' | 'declining';
  /** Engagement intensity (0-100) */
  engagementLevel: number;
  /** How much difficulty the student can tolerate before frustration */
  frustrationTolerance: 'low' | 'medium' | 'high';
  /** Academic confidence (0-100) */
  academicConfidence: number;
  /** Emotional history (last 10 state snapshots) */
  stateHistory: Array<{
    state: EmotionalState;
    timestamp: number;
    trigger: string;
  }>;
  /** Resilience score: ability to recover from setbacks */
  resilienceScore: number;
}

/** Signal that indicates an emotional shift */
export interface EmotionalSignal {
  type: EmotionalSignalType;
  timestamp: number;
  intensity: number; // 0-10
  context?: string;
}

export type EmotionalSignalType =
  | 'correct_answer'
  | 'wrong_answer'
  | 'consecutive_success'
  | 'consecutive_failure'
  | 'help_requested'
  | 'content_skipped'
  | 'fast_engagement'     // quick interactions = possibly excited or bored
  | 'slow_engagement'     // deliberate = focused or confused
  | 'topic_exploration'   // exploring new topics = curious
  | 'topic_avoidance'     // avoiding certain topics = anxious
  | 'positive_language'   // detected positive sentiment in chat
  | 'negative_language'   // detected negative sentiment in chat
  | 'break_taken'
  | 'long_session'
  | 'retry_after_failure' // trying again after failing = determined
  | 'give_up_signal';     // abandoning after failure = discouraged

const EMOTIONAL_STORAGE_KEY = 'lumina_emotional_state';

// ============================================================================
//  STORAGE
// ============================================================================

interface StoredEmotionalData {
  signals: EmotionalSignal[];
  stateHistory: EmotionalProfile['stateHistory'];
  lastComputed: EmotionalProfile | null;
}

function getStoredEmotionalData(): StoredEmotionalData {
  try {
    const raw = localStorage.getItem(EMOTIONAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { signals: [], stateHistory: [], lastComputed: null };
}

function storeEmotionalData(data: StoredEmotionalData): void {
  try {
    if (data.signals.length > 300) data.signals.splice(0, data.signals.length - 300);
    if (data.stateHistory.length > 50) data.stateHistory.splice(0, data.stateHistory.length - 50);
    localStorage.setItem(EMOTIONAL_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

// ============================================================================
//  SIGNAL RECORDING
// ============================================================================

/**
 * Record an emotional signal.
 */
export function recordEmotionalSignal(
  type: EmotionalSignalType,
  intensity: number = 5,
  context?: string,
): void {
  const data = getStoredEmotionalData();
  data.signals.push({
    type,
    timestamp: Date.now(),
    intensity: Math.max(1, Math.min(10, intensity)),
    context,
  });
  storeEmotionalData(data);
}

/**
 * Detect emotional signals from chat text.
 * Call this on every user message.
 */
export function detectEmotionFromText(text: string): EmotionalSignalType | null {
  const lower = text.toLowerCase();

  // Frustration signals
  if (/\b(ugh|argh|hate|stupid|dumb|give up|quit|impossible|can't do this|this is so hard|wtf|wth)\b/.test(lower) ||
      /!{3,}/.test(lower) ||
      /\?{3,}/.test(lower)) {
    return 'negative_language';
  }

  // Excitement/positive signals
  if (/\b(wow|amazing|cool|awesome|love|great|perfect|yay|nice|brilliant|genius|finally|yes!|get it|understand now)\b/.test(lower) ||
      /!.*!/.test(lower) && !/\?/.test(lower)) {
    return 'positive_language';
  }

  // Confusion signals
  if (/\b(confused|don't get|don't understand|what does .* mean|huh\??|lost|makes no sense|wha?t\?)\b/.test(lower)) {
    return 'negative_language';
  }

  // Curiosity signals
  if (/\b(interesting|tell me more|what about|how does|why does|can you explain|I wonder|curious)\b/.test(lower)) {
    return 'topic_exploration';
  }

  // Determination signals
  if (/\b(let me try again|one more time|I'll get it|try harder|not giving up|let's go)\b/.test(lower)) {
    return 'retry_after_failure';
  }

  return null;
}

// ============================================================================
//  EMOTIONAL STATE COMPUTATION
// ============================================================================

/**
 * Compute the current emotional profile from accumulated signals.
 */
export function computeEmotionalProfile(): EmotionalProfile {
  const data = getStoredEmotionalData();
  const signals = data.signals;

  if (signals.length < 2) {
    return createDefaultProfile();
  }

  // Analyze recent signals (last 30)
  const recent = signals.slice(-30);
  const now = Date.now();

  // Weighted signal counts (more recent = higher weight)
  const weights: Record<EmotionalState, number> = {
    neutral: 10,
    excited: 0,
    confident: 0,
    curious: 0,
    confused: 0,
    frustrated: 0,
    bored: 0,
    anxious: 0,
    discouraged: 0,
    determined: 0,
  };

  for (const signal of recent) {
    const ageMinutes = (now - signal.timestamp) / (1000 * 60);
    const recency = Math.max(0.2, 1 - (ageMinutes / 120)); // 2-hour decay
    const w = signal.intensity * recency;

    // Map signal type to emotional state weights
    const mapping: Partial<Record<EmotionalSignalType, Partial<Record<EmotionalState, number>>>> = {
      'correct_answer': { confident: 3, excited: 1 },
      'wrong_answer': { confused: 2, frustrated: 1 },
      'consecutive_success': { excited: 5, confident: 4 },
      'consecutive_failure': { frustrated: 5, discouraged: 3, anxious: 2 },
      'help_requested': { confused: 3, determined: 1 },
      'content_skipped': { bored: 4, frustrated: 1 },
      'fast_engagement': { excited: 2, bored: 1 },
      'slow_engagement': { confused: 1, curious: 2 },
      'topic_exploration': { curious: 5, excited: 2 },
      'topic_avoidance': { anxious: 4, discouraged: 2 },
      'positive_language': { excited: 4, confident: 3 },
      'negative_language': { frustrated: 4, discouraged: 2 },
      'break_taken': { neutral: 3 },
      'long_session': { determined: 2, frustrated: 1 },
      'retry_after_failure': { determined: 5 },
      'give_up_signal': { discouraged: 5, frustrated: 3 },
    };

    const stateWeights = mapping[signal.type] || {};
    for (const [state, weight] of Object.entries(stateWeights)) {
      if (state in weights) {
        weights[state as EmotionalState] += (weight as number) * w;
      }
    }
  }

  // Determine primary and secondary states
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const currentState = sorted[0][0] as EmotionalState;
  const secondaryState = sorted[1][1] > sorted[0][1] * 0.5 
    ? sorted[1][0] as EmotionalState : null;

  // Confidence in assessment
  const totalWeight = sorted.reduce((sum, [, w]) => sum + w, 0);
  const topWeight = sorted[0][1];
  const assessmentConfidence = Math.min(95, Math.round((topWeight / totalWeight) * 100));

  // Motivation level
  const positiveSignals = recent.filter(s => 
    ['correct_answer', 'consecutive_success', 'positive_language', 'topic_exploration', 'retry_after_failure'].includes(s.type)
  ).length;
  const negativeSignals = recent.filter(s => 
    ['wrong_answer', 'consecutive_failure', 'negative_language', 'give_up_signal', 'content_skipped'].includes(s.type)
  ).length;
  const motivationLevel = Math.max(10, Math.min(100, 50 + (positiveSignals - negativeSignals) * 5));

  // Motivation trend (compare first half vs second half of recent signals)
  const mid = Math.floor(recent.length / 2);
  const firstHalfPositive = recent.slice(0, mid).filter(s => ['correct_answer', 'positive_language', 'consecutive_success'].includes(s.type)).length;
  const secondHalfPositive = recent.slice(mid).filter(s => ['correct_answer', 'positive_language', 'consecutive_success'].includes(s.type)).length;
  const motivationTrend = secondHalfPositive > firstHalfPositive + 1 ? 'rising' as const
    : secondHalfPositive < firstHalfPositive - 1 ? 'declining' as const : 'stable' as const;

  // Engagement level
  const recentInteractionRate = recent.length / Math.max(1, (now - recent[0].timestamp) / (1000 * 60));
  const engagementLevel = Math.min(100, Math.round(recentInteractionRate * 20));

  // Frustration tolerance
  const consecutiveFailuresBefore = recent.filter(s => s.type === 'consecutive_failure').length;
  const retriesAfterFail = recent.filter(s => s.type === 'retry_after_failure').length;
  const frustrationTolerance = retriesAfterFail > consecutiveFailuresBefore 
    ? 'high' as const : retriesAfterFail > 0 ? 'medium' as const : 'low' as const;

  // Academic confidence
  const accuracySignals = recent.filter(s => s.type === 'correct_answer' || s.type === 'wrong_answer');
  const correctPct = accuracySignals.length > 0
    ? accuracySignals.filter(s => s.type === 'correct_answer').length / accuracySignals.length * 100
    : 50;
  const academicConfidence = Math.round(correctPct * 0.6 + motivationLevel * 0.4);

  // Resilience score
  const recoveryEvents = recent.filter(s => s.type === 'retry_after_failure' || 
    (s.type === 'correct_answer' && signals.indexOf(s) > 0 && signals[signals.indexOf(s) - 1]?.type === 'wrong_answer')
  ).length;
  const resilienceScore = Math.min(100, Math.round(
    (frustrationTolerance === 'high' ? 40 : frustrationTolerance === 'medium' ? 25 : 10) +
    recoveryEvents * 10 +
    (motivationTrend === 'rising' ? 20 : motivationTrend === 'stable' ? 10 : 0)
  ));

  // Update state history
  const stateHistory = [...data.stateHistory];
  const lastState = stateHistory[stateHistory.length - 1];
  if (!lastState || lastState.state !== currentState || (now - lastState.timestamp) > 300000) {
    stateHistory.push({
      state: currentState,
      timestamp: now,
      trigger: recent[recent.length - 1]?.type || 'computed',
    });
  }

  const profile: EmotionalProfile = {
    currentState,
    secondaryState,
    confidence: assessmentConfidence,
    motivationLevel,
    motivationTrend,
    engagementLevel,
    frustrationTolerance,
    academicConfidence,
    stateHistory: stateHistory.slice(-10),
    resilienceScore,
  };

  // Store
  data.lastComputed = profile;
  data.stateHistory = stateHistory;
  storeEmotionalData(data);

  return profile;
}

function createDefaultProfile(): EmotionalProfile {
  return {
    currentState: 'neutral',
    secondaryState: null,
    confidence: 20,
    motivationLevel: 60,
    motivationTrend: 'stable',
    engagementLevel: 50,
    frustrationTolerance: 'medium',
    academicConfidence: 50,
    stateHistory: [],
    resilienceScore: 50,
  };
}

/**
 * Generate an emotional context string for AI prompt injection.
 */
export function getEmotionalContextPrompt(profile: EmotionalProfile): string {
  const sections: string[] = [];

  sections.push(`## EMOTIONAL STATE (${profile.confidence}% confidence)`);
  sections.push(`- Current: ${getStateEmoji(profile.currentState)} ${profile.currentState.toUpperCase()}${profile.secondaryState ? ` + ${profile.secondaryState}` : ''}`);
  sections.push(`- Motivation: ${profile.motivationLevel}% (${profile.motivationTrend})`);
  sections.push(`- Engagement: ${profile.engagementLevel}%`);
  sections.push(`- Academic Confidence: ${profile.academicConfidence}%`);
  sections.push(`- Resilience: ${profile.resilienceScore}%`);

  // State-specific behavior instructions
  const stateInstructions: Record<EmotionalState, string> = {
    neutral: 'Student is calm and receptive. Proceed normally with balanced tone.',
    excited: 'Student is EXCITED and engaged! Build on this momentum. Be energetic. Challenge them with something cool. This is the optimal learning state.',
    confident: 'Student feels CONFIDENT. Great time to introduce slightly harder material. Push their boundaries while maintaining their belief.',
    curious: 'Student is CURIOUS and exploring. Feed this curiosity! Go deeper, share fascinating connections, ask thought-provoking questions.',
    confused: 'Student is CONFUSED. SLOW DOWN. Ask "What part is unclear?" Use a completely different explanation approach. Start with something concrete they already know. Be warm and patient.',
    frustrated: 'Student is FRUSTRATED. CRITICAL: Be empathetic first ("I can see this is challenging — that\'s actually a sign your brain is growing"). Simplify drastically. Give them a WIN on something easier first, then carefully build back up. NEVER say "this is easy."',
    bored: 'Student seems BORED. Change approach immediately: use a story, pose a paradox, connect to their interests, present a challenge, or ask a provocative question. Make it relevant to their life.',
    anxious: 'Student seems ANXIOUS about this topic. Be reassuring. Lower stakes ("There\'s no wrong answer here, we\'re just exploring"). Start with what they know well. Build confidence before introducing challenging material.',
    discouraged: 'Student is DISCOURAGED. PRIORITY: Restore belief. Acknowledge their effort explicitly. Reference past successes. Set tiny, achievable goals. "You understood [X] perfectly — this is just one more step from there."',
    determined: 'Student is DETERMINED. They\'re pushing through difficulty. Honor this resilience. Provide the support they need but let them drive. Celebrate the effort, not just results.',
  };

  sections.push(`\nTONE ADAPTATION: ${stateInstructions[profile.currentState]}`);

  // Motivation-specific instructions
  if (profile.motivationLevel < 30) {
    sections.push(`\n⚠️ LOW MOTIVATION: Prioritize engagement over content depth. Use gamification language ("Let's see if you can..."). Connect material to student's interests. Keep interactions SHORT and rewarding.`);
  } else if (profile.motivationLevel > 80) {
    sections.push(`\n🚀 HIGH MOTIVATION: Student is ready for deep learning. Take advantage of this state for complex material. Set ambitious goals.`);
  }

  // Frustration tolerance adaptation
  if (profile.frustrationTolerance === 'low') {
    sections.push(`\nFRUSTRATION TOLERANCE: LOW. Scaffold heavily. Never present more than 2 challenging concepts in a row. Insert "easy win" questions between hard ones.`);
  }

  return sections.join('\n');
}

function getStateEmoji(state: EmotionalState): string {
  const emojis: Record<EmotionalState, string> = {
    neutral: '😊',
    excited: '🤩',
    confident: '💪',
    curious: '🔍',
    confused: '😕',
    frustrated: '😤',
    bored: '😴',
    anxious: '😰',
    discouraged: '😞',
    determined: '🔥',
  };
  return emojis[state] || '😊';
}
