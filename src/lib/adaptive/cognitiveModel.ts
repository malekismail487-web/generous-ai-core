/**
 * cognitiveModel.ts — Cognitive Load & Fatigue Detection System
 * =============================================================
 * 
 * Models the student's cognitive state in real-time by tracking:
 * - Cognitive load (how much mental effort they're expending)
 * - Fatigue level (accumulated mental exhaustion)
 * - Attention span (how focused they are)
 * - Zone of Proximal Development (optimal challenge level)
 * - Working memory capacity estimation
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                   COGNITIVE MODEL                           │
 * ├───────────────┬──────────────┬──────────────┬──────────────┤
 * │  Load Tracker │   Fatigue    │  Attention   │    ZPD       │
 * │  (real-time)  │  Detector    │   Monitor    │  Calculator  │
 * ├───────────────┴──────────────┴──────────────┴──────────────┤
 * │              WORKING MEMORY ESTIMATOR                       │
 * │  Estimates capacity based on task performance patterns       │
 * ├────────────────────────────────────────────────────────────-┤
 * │              COGNITIVE STATE ADVISOR                         │
 * │  Generates real-time recommendations for content delivery    │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * Based on Cognitive Load Theory (Sweller, 1988) and
 * Vygotsky's Zone of Proximal Development.
 */

// ============================================================================
//  TYPES
// ============================================================================

/** Real-time cognitive state snapshot */
export interface CognitiveState {
  /** Current cognitive load estimate (0-100). High = overloaded. */
  cognitiveLoad: number;
  /** Fatigue level (0-100). Accumulates over study sessions. */
  fatigueLevel: number;
  /** Attention quality (0-100). High = focused. */
  attentionScore: number;
  /** Estimated working memory slots available (typically 3-7 items) */
  workingMemoryCapacity: number;
  /** Zone of Proximal Development range */
  zpd: {
    /** Current knowledge level (0-100) */
    currentLevel: number;
    /** Optimal challenge level (slightly above current) */
    optimalChallenge: number;
    /** Maximum challenge before frustration */
    frustrationThreshold: number;
    /** Minimum challenge before boredom */
    boredomThreshold: number;
  };
  /** Overall readiness to learn (0-100) */
  learningReadiness: number;
  /** Recommended action based on current state */
  recommendation: CognitiveRecommendation;
  /** When this state was computed */
  timestamp: number;
}

export type CognitiveRecommendation = 
  | 'continue_normal'       // Student is in the zone
  | 'reduce_complexity'     // Cognitive overload detected
  | 'increase_challenge'    // Student is bored/under-challenged
  | 'suggest_break'         // Fatigue detected
  | 'switch_modality'       // Attention declining, change approach
  | 'review_basics'         // Working memory overloaded, go back to fundamentals
  | 'encourage_and_simplify' // Student showing frustration signals
  | 'celebrate_progress';    // Student is doing well, reinforce

/** A session event that affects cognitive state */
export interface CognitiveEvent {
  type: CognitiveEventType;
  timestamp: number;
  value?: number;
  metadata?: Record<string, unknown>;
}

export type CognitiveEventType =
  | 'question_answered_correct'
  | 'question_answered_wrong'
  | 'question_answered_slow'      // took > 2x expected time
  | 'question_answered_fast'      // took < 0.5x expected time
  | 'consecutive_errors'          // multiple wrong answers in a row
  | 'consecutive_correct'         // multiple right answers in a row
  | 'topic_switch'                // changed to a new topic
  | 'help_requested'              // asked for help/explanation
  | 'content_skipped'             // skipped content without reading
  | 're_read_content'             // went back to re-read something
  | 'session_start'
  | 'session_pause'
  | 'session_resume'
  | 'long_idle'                   // no interaction for extended period
  | 'rapid_interactions'          // many interactions in short time
  | 'difficulty_escalation'       // difficulty was increased
  | 'difficulty_reduction';       // difficulty was reduced

// Storage key for persisting cognitive session data
const COGNITIVE_STORAGE_KEY = 'lumina_cognitive_state';
const SESSION_EVENTS_KEY = 'lumina_cognitive_events';

// ============================================================================
//  COGNITIVE STATE STORAGE
// ============================================================================

interface StoredCognitiveSession {
  events: CognitiveEvent[];
  sessionStartTime: number;
  lastActivityTime: number;
  currentState: CognitiveState | null;
  sessionHistory: Array<{
    date: string;
    totalDuration: number;
    peakFatigue: number;
    averageLoad: number;
    questionsAnswered: number;
    accuracy: number;
  }>;
}

function getStoredSession(): StoredCognitiveSession {
  try {
    const raw = localStorage.getItem(COGNITIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reset if session is from a different day
      const today = new Date().toDateString();
      const sessionDate = new Date(parsed.sessionStartTime).toDateString();
      if (today !== sessionDate) {
        // Archive yesterday's session
        const history = parsed.sessionHistory || [];
        if (parsed.currentState) {
          history.push({
            date: sessionDate,
            totalDuration: (parsed.lastActivityTime - parsed.sessionStartTime) / 1000,
            peakFatigue: parsed.currentState.fatigueLevel,
            averageLoad: parsed.currentState.cognitiveLoad,
            questionsAnswered: parsed.events.filter((e: CognitiveEvent) => 
              e.type.startsWith('question_answered')).length,
            accuracy: calculateSessionAccuracy(parsed.events),
          });
          // Keep last 30 days
          if (history.length > 30) history.splice(0, history.length - 30);
        }
        return {
          events: [],
          sessionStartTime: Date.now(),
          lastActivityTime: Date.now(),
          currentState: null,
          sessionHistory: history,
        };
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return {
    events: [],
    sessionStartTime: Date.now(),
    lastActivityTime: Date.now(),
    currentState: null,
    sessionHistory: [],
  };
}

function storeSession(session: StoredCognitiveSession) {
  try {
    // Keep only last 200 events per session
    if (session.events.length > 200) {
      session.events = session.events.slice(-200);
    }
    localStorage.setItem(COGNITIVE_STORAGE_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

function calculateSessionAccuracy(events: CognitiveEvent[]): number {
  const correct = events.filter(e => e.type === 'question_answered_correct').length;
  const wrong = events.filter(e => e.type === 'question_answered_wrong').length;
  const total = correct + wrong;
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// ============================================================================
//  COGNITIVE LOAD CALCULATOR
// ============================================================================

/**
 * Calculate current cognitive load based on recent events.
 * Uses a weighted sliding window over the last N events.
 * 
 * Cognitive load increases with:
 * - Errors (especially consecutive)
 * - Rapid topic switches
 * - Help requests
 * - High difficulty content
 * - Re-reading content (indicates confusion)
 * 
 * Cognitive load decreases with:
 * - Correct answers
 * - Consistent performance
 * - Pauses/breaks
 * - Familiar topics
 */
function calculateCognitiveLoad(events: CognitiveEvent[]): number {
  if (events.length === 0) return 30; // baseline moderate load

  const recentEvents = events.slice(-30); // last 30 events
  let load = 30; // baseline

  // Time-weighted analysis: more recent events have more impact
  const now = Date.now();
  for (const event of recentEvents) {
    const ageMinutes = (now - event.timestamp) / (1000 * 60);
    const recencyWeight = Math.max(0.2, 1 - (ageMinutes / 60)); // decay over 1 hour

    const impacts: Partial<Record<CognitiveEventType, number>> = {
      'question_answered_wrong': 8,
      'consecutive_errors': 15,
      'question_answered_slow': 5,
      'help_requested': 6,
      're_read_content': 7,
      'topic_switch': 4,
      'difficulty_escalation': 5,
      'rapid_interactions': 3,
      'question_answered_correct': -4,
      'consecutive_correct': -8,
      'question_answered_fast': -3,
      'session_pause': -10,
      'session_resume': -5,
      'difficulty_reduction': -3,
    };

    const impact = impacts[event.type] ?? 0;
    load += impact * recencyWeight;
  }

  // Consecutive error streak amplification
  let consecutiveErrors = 0;
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    if (recentEvents[i].type === 'question_answered_wrong') {
      consecutiveErrors++;
    } else if (recentEvents[i].type === 'question_answered_correct') {
      break;
    }
  }
  if (consecutiveErrors >= 3) load += consecutiveErrors * 5;

  return Math.max(0, Math.min(100, Math.round(load)));
}

// ============================================================================
//  FATIGUE DETECTOR
// ============================================================================

/**
 * Calculate fatigue level based on session duration and performance degradation.
 * 
 * Fatigue signals:
 * - Extended session without breaks (> 45 min)
 * - Performance degradation over time
 * - Increasing response times
 * - More errors in later portions of session
 * - Decreased engagement (content skipping)
 */
function calculateFatigue(events: CognitiveEvent[], sessionStartTime: number): number {
  if (events.length < 5) return 0;

  const sessionDurationMinutes = (Date.now() - sessionStartTime) / (1000 * 60);
  
  // Base fatigue from session duration (logarithmic increase)
  // 0-30 min: low fatigue, 30-60: moderate, 60+: high
  let fatigue = 0;
  if (sessionDurationMinutes > 15) {
    fatigue = Math.min(40, Math.log2(sessionDurationMinutes / 15) * 15);
  }

  // Performance degradation analysis
  const questionEvents = events.filter(e => 
    e.type === 'question_answered_correct' || e.type === 'question_answered_wrong'
  );
  
  if (questionEvents.length >= 10) {
    const firstHalf = questionEvents.slice(0, Math.floor(questionEvents.length / 2));
    const secondHalf = questionEvents.slice(Math.floor(questionEvents.length / 2));
    
    const firstAccuracy = firstHalf.filter(e => e.type === 'question_answered_correct').length / firstHalf.length;
    const secondAccuracy = secondHalf.filter(e => e.type === 'question_answered_correct').length / secondHalf.length;
    
    // If accuracy dropped significantly, increase fatigue
    const degradation = firstAccuracy - secondAccuracy;
    if (degradation > 0.15) fatigue += 15;
    if (degradation > 0.30) fatigue += 20;
  }

  // Content skipping in recent events (sign of disengagement)
  const recentEvents = events.slice(-15);
  const skips = recentEvents.filter(e => e.type === 'content_skipped').length;
  fatigue += skips * 5;

  // Long idle periods (might mean distraction from fatigue)
  const idles = recentEvents.filter(e => e.type === 'long_idle').length;
  fatigue += idles * 8;

  // Breaks reduce fatigue
  const breaks = events.filter(e => e.type === 'session_pause').length;
  fatigue -= breaks * 12;

  return Math.max(0, Math.min(100, Math.round(fatigue)));
}

// ============================================================================
//  ATTENTION MONITOR
// ============================================================================

/**
 * Estimate current attention quality based on interaction patterns.
 * 
 * High attention signals:
 * - Consistent response times
 * - Sequential engagement with content
 * - Thoughtful questions
 * - Good accuracy
 * 
 * Low attention signals:
 * - Erratic response times
 * - Content skipping
 * - Random topic jumping
 * - Long idle periods
 * - Very fast (careless) answers
 */
function calculateAttention(events: CognitiveEvent[]): number {
  if (events.length < 3) return 75; // assume reasonable attention at start

  const recentEvents = events.slice(-20);
  let attention = 75;

  for (const event of recentEvents) {
    const impacts: Partial<Record<CognitiveEventType, number>> = {
      'question_answered_correct': 3,
      'consecutive_correct': 5,
      'question_answered_wrong': -2,
      'consecutive_errors': -5,
      'content_skipped': -8,
      'long_idle': -10,
      'rapid_interactions': -4, // suggests clicking without reading
      'question_answered_fast': -3, // too fast = not thinking
      'question_answered_slow': -1,
      'help_requested': 2, // shows engagement
      're_read_content': 3, // shows effort
      'topic_switch': -2,
      'session_pause': 5, // breaks help attention
    };

    attention += impacts[event.type] ?? 0;
  }

  return Math.max(0, Math.min(100, Math.round(attention)));
}

// ============================================================================
//  WORKING MEMORY ESTIMATOR
// ============================================================================

/**
 * Estimate working memory capacity based on multi-step problem performance.
 * 
 * Working memory (Miller's Law: 7±2 items) determines how many concepts
 * a student can hold simultaneously. We estimate this by tracking:
 * - Performance on multi-step problems
 * - Ability to connect multiple concepts
 * - How many hints/steps needed before understanding
 * - Performance degradation as complexity increases
 */
function estimateWorkingMemory(events: CognitiveEvent[], accuracy: number): number {
  // Base estimate from overall accuracy
  let capacity = 4; // default: average

  if (accuracy >= 85) capacity = 6;
  else if (accuracy >= 70) capacity = 5;
  else if (accuracy >= 55) capacity = 4;
  else if (accuracy >= 40) capacity = 3;
  else capacity = 3;

  // Adjust based on help requests (more help = lower working memory for that topic)
  const recentEvents = events.slice(-30);
  const helpRequests = recentEvents.filter(e => e.type === 'help_requested').length;
  const reReadEvents = recentEvents.filter(e => e.type === 're_read_content').length;

  if (helpRequests > 5) capacity -= 1;
  if (reReadEvents > 3) capacity -= 1;

  // Fast correct answers suggest higher capacity
  const fastCorrect = recentEvents.filter(e => e.type === 'question_answered_fast').length;
  if (fastCorrect > 5) capacity += 1;

  return Math.max(2, Math.min(7, capacity));
}

// ============================================================================
//  ZONE OF PROXIMAL DEVELOPMENT CALCULATOR
// ============================================================================

/**
 * Calculate the Zone of Proximal Development (ZPD).
 * 
 * The ZPD is the sweet spot between what a student can do independently
 * and what they can do with help. Content should be pitched here for
 * optimal learning.
 * 
 * @param accuracy - Recent accuracy (0-100)
 * @param cognitiveLoad - Current cognitive load (0-100)
 * @param fatigue - Current fatigue (0-100)
 */
function calculateZPD(
  accuracy: number,
  cognitiveLoad: number,
  fatigue: number,
): CognitiveState['zpd'] {
  // Current level based on accuracy
  const currentLevel = accuracy;

  // Optimal challenge: slightly above current level
  // When well-rested and low load: push further
  // When fatigued or overloaded: keep closer to current level
  const pushFactor = Math.max(5, 20 - (fatigue * 0.1) - (cognitiveLoad * 0.1));
  const optimalChallenge = Math.min(100, currentLevel + pushFactor);

  // Frustration threshold: where challenge becomes overwhelming
  const frustrationThreshold = Math.min(100, currentLevel + pushFactor * 2.5);

  // Boredom threshold: where content is too easy
  const boredomThreshold = Math.max(0, currentLevel - 15);

  return {
    currentLevel: Math.round(currentLevel),
    optimalChallenge: Math.round(optimalChallenge),
    frustrationThreshold: Math.round(frustrationThreshold),
    boredomThreshold: Math.round(boredomThreshold),
  };
}

// ============================================================================
//  RECOMMENDATION ENGINE
// ============================================================================

/**
 * Generate a recommendation based on the current cognitive state.
 */
function generateRecommendation(
  load: number,
  fatigue: number,
  attention: number,
  accuracy: number,
  consecutiveErrors: number,
  consecutiveCorrect: number,
): CognitiveRecommendation {
  // Priority-ordered checks
  if (fatigue > 75) return 'suggest_break';
  if (consecutiveErrors >= 4) return 'encourage_and_simplify';
  if (load > 80) return 'reduce_complexity';
  if (load > 70 && accuracy < 40) return 'review_basics';
  if (attention < 30) return 'switch_modality';
  if (fatigue > 50 && load > 60) return 'suggest_break';
  if (accuracy > 90 && consecutiveCorrect >= 5) return 'increase_challenge';
  if (consecutiveCorrect >= 8) return 'celebrate_progress';
  if (accuracy < 50 && load > 50) return 'reduce_complexity';
  return 'continue_normal';
}

// ============================================================================
//  PUBLIC API
// ============================================================================

/**
 * Record a cognitive event in the current session.
 */
export function recordCognitiveEvent(event: CognitiveEvent): void {
  const session = getStoredSession();
  session.events.push(event);
  session.lastActivityTime = Date.now();
  storeSession(session);
}

/**
 * Record a cognitive event by type (convenience wrapper).
 */
export function recordCognitiveEventByType(
  type: CognitiveEventType,
  value?: number,
  metadata?: Record<string, unknown>,
): void {
  recordCognitiveEvent({
    type,
    timestamp: Date.now(),
    value,
    metadata,
  });
}

/**
 * Compute the full cognitive state from the current session.
 * This is the main entry point for getting the student's cognitive state.
 */
export function computeCognitiveState(recentAccuracy: number = 60): CognitiveState {
  const session = getStoredSession();
  const events = session.events;

  const cognitiveLoad = calculateCognitiveLoad(events);
  const fatigueLevel = calculateFatigue(events, session.sessionStartTime);
  const attentionScore = calculateAttention(events);
  const workingMemoryCapacity = estimateWorkingMemory(events, recentAccuracy);
  const zpd = calculateZPD(recentAccuracy, cognitiveLoad, fatigueLevel);

  // Count consecutive streaks
  let consecutiveErrors = 0;
  let consecutiveCorrect = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'question_answered_wrong' || events[i].type === 'consecutive_errors') {
      consecutiveErrors++;
    } else if (events[i].type === 'question_answered_correct' || events[i].type === 'consecutive_correct') {
      consecutiveCorrect++;
    } else {
      break;
    }
  }

  const recommendation = generateRecommendation(
    cognitiveLoad, fatigueLevel, attentionScore, recentAccuracy,
    consecutiveErrors, consecutiveCorrect,
  );

  // Learning readiness composite score
  const learningReadiness = Math.round(
    (100 - cognitiveLoad) * 0.3 +
    (100 - fatigueLevel) * 0.3 +
    attentionScore * 0.25 +
    (recentAccuracy > 40 ? 15 : 0) // bonus for being in a learning-capable state
  );

  const state: CognitiveState = {
    cognitiveLoad,
    fatigueLevel,
    attentionScore,
    workingMemoryCapacity,
    zpd,
    learningReadiness: Math.max(0, Math.min(100, learningReadiness)),
    recommendation,
    timestamp: Date.now(),
  };

  // Store the computed state
  session.currentState = state;
  storeSession(session);

  return state;
}

/**
 * Generate a cognitive state context string for AI prompt injection.
 */
export function getCognitiveContextPrompt(state: CognitiveState): string {
  const sections: string[] = [];

  sections.push(`## COGNITIVE STATE (Real-Time Monitoring)`);
  sections.push(`- Cognitive Load: ${state.cognitiveLoad}% ${state.cognitiveLoad > 70 ? '⚠️ HIGH' : state.cognitiveLoad > 40 ? '📊 MODERATE' : '✅ LOW'}`);
  sections.push(`- Fatigue Level: ${state.fatigueLevel}% ${state.fatigueLevel > 60 ? '😴 FATIGUED' : state.fatigueLevel > 30 ? '🟡 MODERATE' : '⚡ FRESH'}`);
  sections.push(`- Attention: ${state.attentionScore}% ${state.attentionScore > 70 ? '🎯 FOCUSED' : state.attentionScore > 40 ? '🟡 DRIFTING' : '😶‍🌫️ DISTRACTED'}`);
  sections.push(`- Working Memory: ~${state.workingMemoryCapacity} items (${state.workingMemoryCapacity >= 6 ? 'high' : state.workingMemoryCapacity >= 4 ? 'average' : 'limited'} capacity)`);
  sections.push(`- Learning Readiness: ${state.learningReadiness}%`);
  sections.push(`- ZPD: Current ${state.zpd.currentLevel}% | Optimal Challenge ${state.zpd.optimalChallenge}% | Frustration at ${state.zpd.frustrationThreshold}%`);

  // Generate behavior instructions based on recommendation
  const instructions: Record<CognitiveRecommendation, string> = {
    continue_normal: 'Student is in the optimal learning zone. Maintain current pace and complexity.',
    reduce_complexity: 'COGNITIVE OVERLOAD detected. IMMEDIATELY simplify: shorter sentences, fewer concepts per explanation, more whitespace, break into smaller steps. Remove all non-essential information.',
    increase_challenge: 'Student is UNDER-CHALLENGED. Increase difficulty: harder examples, deeper theory, more complex connections. Ask probing questions.',
    suggest_break: 'FATIGUE DETECTED. Gently suggest taking a 5-10 minute break. If continuing, use lighter content — summaries, reviews, easy wins. Avoid introducing new complex concepts.',
    switch_modality: 'ATTENTION DECLINING. Switch explanation format: if you were using text → try a diagram. If logical → try an analogy/story. Change the pace to re-engage.',
    review_basics: 'WORKING MEMORY OVERLOADED. Go back to fundamentals. Re-explain the foundation concept before building up. Use simpler examples.',
    encourage_and_simplify: 'FRUSTRATION SIGNALS detected (multiple consecutive errors). BE ENCOURAGING: "Let\'s take a step back — you\'re doing better than you think." Simplify drastically. Give a confidence-boosting easy win.',
    celebrate_progress: 'Student on a WINNING STREAK! Acknowledge their progress enthusiastically. Challenge them with something exciting and advanced.',
  };

  sections.push(`\nADAPTIVE INSTRUCTION: ${instructions[state.recommendation]}`);

  // Working memory-specific instructions
  if (state.workingMemoryCapacity <= 3) {
    sections.push(`\nWORKING MEMORY ADAPTATION:
- Present ONE concept at a time.
- Use chunking: break complex ideas into 2-3 simple parts.
- Provide frequent recap checkpoints.
- Use concrete examples before abstract rules.
- Avoid compound sentences with multiple clauses.`);
  } else if (state.workingMemoryCapacity >= 6) {
    sections.push(`\nWORKING MEMORY ADAPTATION:
- Can handle multi-step reasoning and complex connections.
- Safe to present 3-4 related concepts together.
- Can use sophisticated analogies with multiple layers.
- Challenge with synthesis and evaluation tasks.`);
  }

  return sections.join('\n');
}

/**
 * Get historical session data for trend analysis.
 */
export function getSessionHistory(): StoredCognitiveSession['sessionHistory'] {
  return getStoredSession().sessionHistory;
}

/**
 * Reset the current cognitive session (e.g., after a long break).
 */
export function resetCognitiveSession(): void {
  const session = getStoredSession();
  const history = session.sessionHistory;
  
  if (session.currentState) {
    history.push({
      date: new Date(session.sessionStartTime).toDateString(),
      totalDuration: (session.lastActivityTime - session.sessionStartTime) / 1000,
      peakFatigue: session.currentState.fatigueLevel,
      averageLoad: session.currentState.cognitiveLoad,
      questionsAnswered: session.events.filter(e => e.type.startsWith('question_answered')).length,
      accuracy: calculateSessionAccuracy(session.events),
    });
  }

  storeSession({
    events: [],
    sessionStartTime: Date.now(),
    lastActivityTime: Date.now(),
    currentState: null,
    sessionHistory: history.slice(-30),
  });
}
