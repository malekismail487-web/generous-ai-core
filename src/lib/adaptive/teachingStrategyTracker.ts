/**
 * teachingStrategyTracker.ts — Teaching Strategy Tracker & Effectiveness Ranker
 * ==============================================================================
 * 
 * Tracks which teaching strategies Lumina uses, monitors whether they actually
 * work (by checking subsequent student answers), and generates ranked
 * recommendations for future interactions.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  STRATEGY LOGGER     │  OUTCOME EVALUATOR  │  EFFECTIVENESS     │
 * │  Records which       │  Monitors next 3-5  │  RANKER            │
 * │  strategy was used   │  answers after a     │  Ranks strategies  │
 * │  for which topic     │  strategy was used   │  per subject       │
 * ├──────────────────────┴─────────────────────┴────────────────────┤
 * │  SWITCH DETECTOR                                                │
 * │  Detects 3+ consecutive failures → triggers SWITCH signal       │
 * └──────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export type TeachingStrategy =
  | 'visual_diagram'
  | 'step_by_step'
  | 'analogy_based'
  | 'socratic_questioning'
  | 'practice_first'
  | 'narrative_story'
  | 'real_world_application'
  | 'worked_example'
  | 'peer_explanation'
  | 'chunked_micro_lessons';

export interface TeachingEvent {
  id: string;
  topic: string;
  subject: string;
  strategy: TeachingStrategy;
  feature: string; // notes, chat, lecture, flashcards, etc.
  timestamp: number;
  /** Number of subsequent correct answers on this topic */
  subsequentCorrect: number;
  /** Number of subsequent wrong answers on this topic */
  subsequentWrong: number;
  /** Whether evaluation is complete (enough follow-up answers collected) */
  evaluated: boolean;
  /** Effectiveness score 0-100, null if not yet evaluated */
  effectivenessScore: number | null;
}

export interface StrategyEffectiveness {
  strategy: TeachingStrategy;
  subject: string;
  totalUses: number;
  averageScore: number; // 0-100
  successRate: number; // 0-100
  lastUsed: number;
}

export interface StrategySwitchSignal {
  topic: string;
  subject: string;
  failedStrategy: TeachingStrategy;
  consecutiveFailures: number;
  recommendedAlternatives: TeachingStrategy[];
  message: string;
}

export interface StrategyRecommendation {
  subject: string;
  ranked: Array<{
    strategy: TeachingStrategy;
    score: number;
    uses: number;
    label: string;
  }>;
  avoid: TeachingStrategy[];
  switchSignals: StrategySwitchSignal[];
}

// ============================================================================
//  CONSTANTS
// ============================================================================

const STORAGE_KEY_EVENTS = 'lumina_teaching_strategies';
const STORAGE_KEY_EFFECTIVENESS = 'lumina_strategy_effectiveness';
const MAX_EVENTS = 200;
const EVALUATION_WINDOW = 5; // number of subsequent answers needed to evaluate
const SWITCH_THRESHOLD = 3; // consecutive failures to trigger switch

const STRATEGY_LABELS: Record<TeachingStrategy, string> = {
  visual_diagram: 'Visual Diagrams & Charts',
  step_by_step: 'Step-by-Step Instructions',
  analogy_based: 'Analogies & Metaphors',
  socratic_questioning: 'Socratic Questioning',
  practice_first: 'Practice Before Theory',
  narrative_story: 'Narrative Storytelling',
  real_world_application: 'Real-World Applications',
  worked_example: 'Worked Examples',
  peer_explanation: 'Peer-Level Explanation',
  chunked_micro_lessons: 'Chunked Micro-Lessons',
};

const ALL_STRATEGIES: TeachingStrategy[] = Object.keys(STRATEGY_LABELS) as TeachingStrategy[];

// ============================================================================
//  STORAGE
// ============================================================================

function getStoredEvents(): TeachingEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeEvents(events: TeachingEvent[]): void {
  try {
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(events));
  } catch { /* ignore */ }
}

function getStoredEffectiveness(): StrategyEffectiveness[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EFFECTIVENESS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeEffectiveness(data: StrategyEffectiveness[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_EFFECTIVENESS, JSON.stringify(data));
  } catch { /* ignore */ }
}

// ============================================================================
//  RECORDING
// ============================================================================

/**
 * Record that a teaching strategy was used for a topic.
 */
export function recordTeachingStrategy(params: {
  topic: string;
  subject: string;
  strategy: TeachingStrategy;
  feature: string;
}): void {
  const events = getStoredEvents();
  events.push({
    id: `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: params.topic.toLowerCase().trim(),
    subject: params.subject.toLowerCase().trim(),
    strategy: params.strategy,
    feature: params.feature,
    timestamp: Date.now(),
    subsequentCorrect: 0,
    subsequentWrong: 0,
    evaluated: false,
    effectivenessScore: null,
  });
  storeEvents(events);
}

/**
 * Record a strategy outcome — called when a student answers a question.
 * This checks if the topic was recently taught and updates the teaching event.
 */
export function recordStrategyOutcome(params: {
  topic: string;
  subject: string;
  isCorrect: boolean;
}): void {
  const events = getStoredEvents();
  const topicLower = params.topic.toLowerCase().trim();
  const subjectLower = params.subject.toLowerCase().trim();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Find unevaluated teaching events for this topic+subject
  let updated = false;
  for (const event of events) {
    if (event.evaluated) continue;
    if (event.timestamp < sevenDaysAgo) continue;
    
    // Fuzzy match: check if topic words overlap
    const eventWords = new Set(event.topic.split(/\s+/).filter(w => w.length > 3));
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    const overlap = topicWords.filter(w => eventWords.has(w)).length;
    const matchScore = eventWords.size > 0 ? overlap / eventWords.size : 0;
    
    if (matchScore < 0.3 && event.subject !== subjectLower) continue;
    if (matchScore < 0.3 && event.topic !== topicLower) continue;

    if (params.isCorrect) {
      event.subsequentCorrect++;
    } else {
      event.subsequentWrong++;
    }

    const totalFollowUp = event.subsequentCorrect + event.subsequentWrong;
    if (totalFollowUp >= EVALUATION_WINDOW) {
      event.evaluated = true;
      event.effectivenessScore = Math.round(
        (event.subsequentCorrect / totalFollowUp) * 100
      );
      // Update aggregated effectiveness
      updateEffectivenessAggregates(event);
    }
    updated = true;
  }

  if (updated) storeEvents(events);
}

/**
 * Update the aggregated effectiveness scores after an event is evaluated.
 */
function updateEffectivenessAggregates(event: TeachingEvent): void {
  if (event.effectivenessScore === null) return;
  
  const data = getStoredEffectiveness();
  const existing = data.find(
    d => d.strategy === event.strategy && d.subject === event.subject
  );

  if (existing) {
    const totalScore = existing.averageScore * existing.totalUses + event.effectivenessScore;
    existing.totalUses++;
    existing.averageScore = Math.round(totalScore / existing.totalUses);
    existing.successRate = Math.round(
      ((existing.successRate * (existing.totalUses - 1)) / 100 +
        (event.effectivenessScore >= 60 ? 1 : 0)) /
        existing.totalUses * 100
    );
    existing.lastUsed = event.timestamp;
  } else {
    data.push({
      strategy: event.strategy,
      subject: event.subject,
      totalUses: 1,
      averageScore: event.effectivenessScore,
      successRate: event.effectivenessScore >= 60 ? 100 : 0,
      lastUsed: event.timestamp,
    });
  }

  storeEffectiveness(data);
}

// ============================================================================
//  ANALYSIS
// ============================================================================

/**
 * Get ranked strategy recommendations for a subject.
 */
export function getStrategyRecommendation(subject?: string): StrategyRecommendation {
  const subjectLower = (subject || 'general').toLowerCase();
  const effectiveness = getStoredEffectiveness();
  const events = getStoredEvents();

  // Filter for this subject (+ general fallback)
  const subjectData = effectiveness.filter(
    d => d.subject === subjectLower || d.subject === 'general'
  );

  // Build ranked list
  const ranked: StrategyRecommendation['ranked'] = [];
  const avoid: TeachingStrategy[] = [];

  for (const strategy of ALL_STRATEGIES) {
    const data = subjectData.find(d => d.strategy === strategy);
    if (data && data.totalUses >= 2) {
      ranked.push({
        strategy,
        score: data.averageScore,
        uses: data.totalUses,
        label: STRATEGY_LABELS[strategy],
      });
      if (data.averageScore < 35 && data.totalUses >= 3) {
        avoid.push(strategy);
      }
    } else {
      // Untested strategy — neutral score to encourage exploration
      ranked.push({
        strategy,
        score: 50,
        uses: data?.totalUses || 0,
        label: STRATEGY_LABELS[strategy],
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  // Detect switch signals
  const switchSignals = detectSwitchSignals(events, subjectLower);

  return { subject: subjectLower, ranked, avoid, switchSignals };
}

/**
 * Detect when a strategy has failed multiple times in a row on the same topic.
 */
function detectSwitchSignals(events: TeachingEvent[], subject: string): StrategySwitchSignal[] {
  const signals: StrategySwitchSignal[] = [];
  const now = Date.now();
  const recentEvents = events.filter(
    e => e.subject === subject && e.evaluated && now - e.timestamp < 14 * 24 * 60 * 60 * 1000
  );

  // Group by topic
  const topicGroups: Record<string, TeachingEvent[]> = {};
  for (const e of recentEvents) {
    if (!topicGroups[e.topic]) topicGroups[e.topic] = [];
    topicGroups[e.topic].push(e);
  }

  for (const [topic, topicEvents] of Object.entries(topicGroups)) {
    // Check for consecutive failures with the same strategy
    const sorted = topicEvents.sort((a, b) => b.timestamp - a.timestamp);
    let consecutiveFailures = 0;
    let failedStrategy: TeachingStrategy | null = null;

    for (const e of sorted) {
      if (e.effectivenessScore !== null && e.effectivenessScore < 40) {
        if (!failedStrategy) failedStrategy = e.strategy;
        if (e.strategy === failedStrategy) {
          consecutiveFailures++;
        } else break;
      } else break;
    }

    if (consecutiveFailures >= SWITCH_THRESHOLD && failedStrategy) {
      const effectiveness = getStoredEffectiveness();
      const alternatives = ALL_STRATEGIES
        .filter(s => s !== failedStrategy)
        .map(s => ({
          strategy: s,
          score: effectiveness.find(e => e.strategy === s && e.subject === subject)?.averageScore || 50,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(a => a.strategy);

      signals.push({
        topic,
        subject,
        failedStrategy,
        consecutiveFailures,
        recommendedAlternatives: alternatives,
        message: `"${topic}" taught ${consecutiveFailures}x with ${STRATEGY_LABELS[failedStrategy]} — FAILED. Switch to: ${alternatives.map(a => STRATEGY_LABELS[a]).join(', ')}`,
      });
    }
  }

  return signals;
}

// ============================================================================
//  STRATEGY INFERENCE
// ============================================================================

/**
 * Infer which teaching strategy was likely used based on content features.
 * Called automatically when content is generated to log the strategy.
 */
export function inferStrategyFromContent(content: string): TeachingStrategy {
  const lower = content.toLowerCase();
  const scores: Record<TeachingStrategy, number> = {
    visual_diagram: 0,
    step_by_step: 0,
    analogy_based: 0,
    socratic_questioning: 0,
    practice_first: 0,
    narrative_story: 0,
    real_world_application: 0,
    worked_example: 0,
    peer_explanation: 0,
    chunked_micro_lessons: 0,
  };

  // Visual indicators
  if (/┌|┐|└|┘|│|─|╔|╗|╚|╝|║|═/.test(content)) scores.visual_diagram += 5;
  if (/diagram|chart|table|graph|figure|flowchart|visual/i.test(lower)) scores.visual_diagram += 3;
  if ((content.match(/\|/g) || []).length > 8) scores.visual_diagram += 3;

  // Step-by-step
  const stepMatches = lower.match(/step\s*\d|step\s*[a-z]:|^\d+\./gm);
  if (stepMatches && stepMatches.length >= 3) scores.step_by_step += 5;
  if (/first,?\s|then,?\s|next,?\s|finally,?\s/i.test(lower)) scores.step_by_step += 2;

  // Analogy
  if (/like\s+a\s|think\s+of\s+it\s+as|similar\s+to|imagine\s|analogy|metaphor|just\s+like|compare\s+this/i.test(lower)) {
    scores.analogy_based += 5;
  }

  // Socratic
  if (/\?\s*\n|what\s+do\s+you\s+think|why\s+do\s+you|can\s+you\s+explain|how\s+would\s+you/i.test(lower)) {
    scores.socratic_questioning += 4;
  }
  const questionCount = (content.match(/\?/g) || []).length;
  if (questionCount >= 5) scores.socratic_questioning += 3;

  // Practice first
  if (/try\s+this|exercise|practice|solve\s+this|your\s+turn/i.test(lower) && content.indexOf('?') < content.length * 0.3) {
    scores.practice_first += 5;
  }

  // Narrative
  if (/once\s+upon|story|journey|imagine\s+you|let\s+me\s+tell|picture\s+this|back\s+in/i.test(lower)) {
    scores.narrative_story += 5;
  }

  // Real-world
  if (/real[\s-]world|everyday|in\s+your\s+daily|cooking|driving|shopping|sports|real\s+life/i.test(lower)) {
    scores.real_world_application += 5;
  }

  // Worked example
  if (/example|solution|let'?s?\s+solve|work\s+through|worked/i.test(lower)) {
    scores.worked_example += 3;
  }
  if (/=\s*\d|answer\s*[:=]/i.test(lower)) scores.worked_example += 2;

  // Peer explanation
  if (/simple\s+terms|basically|in\s+other\s+words|plain\s+english|eli5|explain\s+like/i.test(lower)) {
    scores.peer_explanation += 5;
  }

  // Chunked
  if (/part\s+\d|section\s+\d|chunk|mini[\s-]lesson|bite[\s-]size|module\s+\d/i.test(lower)) {
    scores.chunked_micro_lessons += 5;
  }

  // Find highest score
  let best: TeachingStrategy = 'worked_example';
  let bestScore = 0;
  for (const [strategy, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = strategy as TeachingStrategy;
    }
  }

  return best;
}

// ============================================================================
//  CONTEXT GENERATION
// ============================================================================

/**
 * Generate teaching strategy context for AI prompt injection.
 */
export function getTeachingStrategyContextPrompt(subject?: string): string {
  const rec = getStrategyRecommendation(subject);
  
  if (rec.ranked.every(r => r.uses === 0)) return ''; // no data yet

  const sections: string[] = [];
  sections.push(`## TEACHING STRATEGY INTELLIGENCE`);

  // Top strategies
  const tested = rec.ranked.filter(r => r.uses >= 2);
  if (tested.length > 0) {
    sections.push(`Strategies ranked by effectiveness for "${rec.subject}":`);
    for (let i = 0; i < Math.min(5, tested.length); i++) {
      const r = tested[i];
      const marker = r.score < 40 ? ' ← AVOID' : r.score >= 70 ? ' ← PREFERRED' : '';
      sections.push(`${i + 1}. ${r.label}: ${r.score}% success (${r.uses} uses)${marker}`);
    }
  }

  // Switch signals
  if (rec.switchSignals.length > 0) {
    sections.push(`\nACTIVE SWITCH SIGNALS:`);
    for (const signal of rec.switchSignals) {
      sections.push(`- ${signal.message}`);
    }
  }

  // Avoid list
  if (rec.avoid.length > 0) {
    sections.push(`\nAVOID these strategies for ${rec.subject}: ${rec.avoid.map(s => STRATEGY_LABELS[s]).join(', ')}`);
  }

  // Recommended strategy instruction
  const top = rec.ranked[0];
  if (top && top.uses >= 2 && top.score >= 60) {
    sections.push(`\nRECOMMENDED: Use "${top.label}" approach for this student in ${rec.subject}.`);
  }

  return sections.join('\n');
}
