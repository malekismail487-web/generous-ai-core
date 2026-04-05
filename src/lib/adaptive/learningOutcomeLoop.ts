/**
 * learningOutcomeLoop.ts — Teaching Outcome Feedback Loop
 * ========================================================
 * 
 * Closes the feedback loop between teaching and learning:
 *   Teach a topic → Student answers questions → Did they learn?
 *   YES → reinforce that approach
 *   NO  → flag the approach as ineffective, switch strategy
 * 
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  TEACHING RECORD       │  OUTCOME TRACKER    │  ADAPTIVE        │
 * │  Logs every teaching   │  Correlates answers  │  STRATEGY        │
 * │  event with topic hash │  with recent teaching│  SELECTOR        │
 * │  and strategy used     │  events              │  Picks best      │
 * │                        │                      │  approach         │
 * └──────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export interface TeachingRecord {
  id: string;
  topic: string;
  subject: string;
  strategy: string;
  feature: string; // notes, chat, lecture, flashcards, etc.
  timestamp: number;
  /** Whether the student demonstrated learning after this teaching */
  learned: boolean | null; // null = not yet assessed
  /** Number of correct follow-up answers */
  correctFollowUps: number;
  /** Number of wrong follow-up answers */
  wrongFollowUps: number;
  /** How many times this topic has been taught total */
  teachingAttempt: number;
}

export interface TeachingSuccessRate {
  subject: string;
  totalTaught: number;
  learnedSuccessfully: number;
  successRate: number; // 0-100
  /** Topics that were taught multiple times but not learned */
  persistentlyDifficult: Array<{
    topic: string;
    attempts: number;
    strategiesUsed: string[];
  }>;
  /** Topics learned on first attempt */
  quickWins: string[];
}

export interface StrategySelection {
  recommendedStrategy: string;
  confidence: number; // 0-100
  reasoning: string;
  alternativeStrategies: string[];
  /** Whether escalation is needed (all strategies tried and failed) */
  escalationNeeded: boolean;
  escalationMessage?: string;
}

// ============================================================================
//  CONSTANTS & STORAGE
// ============================================================================

const STORAGE_KEY = 'lumina_teaching_records';
const MAX_RECORDS = 300;
const LEARNING_ASSESSMENT_WINDOW = 3; // answers needed to assess learning

function getStoredRecords(): TeachingRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeRecords(records: TeachingRecord[]): void {
  try {
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
}

// ============================================================================
//  RECORDING
// ============================================================================

/**
 * Record that a topic was taught.
 */
export function recordTeaching(params: {
  topic: string;
  subject: string;
  strategy: string;
  feature: string;
}): void {
  const records = getStoredRecords();
  const topicLower = params.topic.toLowerCase().trim();
  const subjectLower = params.subject.toLowerCase().trim();

  // Count how many times this topic has been taught before
  const previousAttempts = records.filter(
    r => r.topic === topicLower && r.subject === subjectLower
  ).length;

  records.push({
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: topicLower,
    subject: subjectLower,
    strategy: params.strategy,
    feature: params.feature,
    timestamp: Date.now(),
    learned: null,
    correctFollowUps: 0,
    wrongFollowUps: 0,
    teachingAttempt: previousAttempts + 1,
  });

  storeRecords(records);
}

/**
 * Record a learning outcome — called when a student answers a question
 * after being taught a topic.
 */
export function recordLearningOutcome(params: {
  topic: string;
  subject: string;
  isCorrect: boolean;
}): void {
  const records = getStoredRecords();
  const topicLower = params.topic.toLowerCase().trim();
  const subjectLower = params.subject.toLowerCase().trim();
  const now = Date.now();
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  let updated = false;

  for (const record of records) {
    if (record.learned !== null) continue; // already assessed
    if (record.timestamp < fourteenDaysAgo) continue;

    // Fuzzy match on topic
    const recordWords = new Set(record.topic.split(/\s+/).filter(w => w.length > 3));
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    const overlap = topicWords.filter(w => recordWords.has(w)).length;
    const matchScore = recordWords.size > 0 ? overlap / recordWords.size : 0;

    if (matchScore < 0.3 && record.subject !== subjectLower) continue;
    if (matchScore < 0.3 && record.topic !== topicLower) continue;

    if (params.isCorrect) {
      record.correctFollowUps++;
    } else {
      record.wrongFollowUps++;
    }

    const total = record.correctFollowUps + record.wrongFollowUps;
    if (total >= LEARNING_ASSESSMENT_WINDOW) {
      const successRate = record.correctFollowUps / total;
      record.learned = successRate >= 0.6; // 60% threshold
    }

    updated = true;
  }

  if (updated) storeRecords(records);
}

// ============================================================================
//  ANALYSIS
// ============================================================================

/**
 * Calculate teaching success rates per subject.
 */
export function getTeachingSuccessRate(subject?: string): TeachingSuccessRate {
  const records = getStoredRecords();
  const subjectLower = (subject || '').toLowerCase();

  const filtered = subjectLower
    ? records.filter(r => r.subject === subjectLower)
    : records;

  const assessed = filtered.filter(r => r.learned !== null);
  const learnedCount = assessed.filter(r => r.learned === true).length;

  // Find persistently difficult topics
  const topicAttempts: Record<string, { attempts: number; strategies: Set<string>; learned: boolean }> = {};
  for (const r of filtered) {
    if (!topicAttempts[r.topic]) {
      topicAttempts[r.topic] = { attempts: 0, strategies: new Set(), learned: false };
    }
    topicAttempts[r.topic].attempts++;
    topicAttempts[r.topic].strategies.add(r.strategy);
    if (r.learned === true) topicAttempts[r.topic].learned = true;
  }

  const persistentlyDifficult = Object.entries(topicAttempts)
    .filter(([, data]) => data.attempts >= 3 && !data.learned)
    .map(([topic, data]) => ({
      topic,
      attempts: data.attempts,
      strategiesUsed: [...data.strategies],
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const quickWins = Object.entries(topicAttempts)
    .filter(([, data]) => data.attempts === 1 && data.learned)
    .map(([topic]) => topic);

  return {
    subject: subjectLower || 'all',
    totalTaught: assessed.length,
    learnedSuccessfully: learnedCount,
    successRate: assessed.length > 0 ? Math.round((learnedCount / assessed.length) * 100) : 0,
    persistentlyDifficult: persistentlyDifficult.slice(0, 5),
    quickWins: quickWins.slice(0, 5),
  };
}

/**
 * Select the best strategy for a given subject based on outcome data.
 */
export function selectBestStrategy(params: {
  subject: string;
  topic?: string;
  availableStrategies?: string[];
}): StrategySelection {
  const records = getStoredRecords();
  const subjectLower = params.subject.toLowerCase();

  // Group records by strategy for this subject
  const strategyResults: Record<string, { successful: number; total: number }> = {};
  const assessedRecords = records.filter(
    r => r.subject === subjectLower && r.learned !== null
  );

  for (const r of assessedRecords) {
    if (!strategyResults[r.strategy]) strategyResults[r.strategy] = { successful: 0, total: 0 };
    strategyResults[r.strategy].total++;
    if (r.learned) strategyResults[r.strategy].successful++;
  }

  // Rank strategies
  const ranked = Object.entries(strategyResults)
    .map(([strategy, data]) => ({
      strategy,
      successRate: data.total > 0 ? Math.round((data.successful / data.total) * 100) : 50,
      uses: data.total,
    }))
    .sort((a, b) => b.successRate - a.successRate);

  // Check if escalation is needed (topic taught many times, never learned)
  let escalationNeeded = false;
  let escalationMessage: string | undefined;
  if (params.topic) {
    const topicLower = params.topic.toLowerCase();
    const topicRecords = records.filter(
      r => r.topic === topicLower && r.subject === subjectLower
    );
    const uniqueStrategies = new Set(topicRecords.map(r => r.strategy));
    const assessed = topicRecords.filter(r => r.learned !== null);
    const neverLearned = assessed.length > 0 && assessed.every(r => !r.learned);

    if (neverLearned && uniqueStrategies.size >= 3) {
      escalationNeeded = true;
      escalationMessage = `"${params.topic}" has been taught ${topicRecords.length} times with ${uniqueStrategies.size} different strategies — none worked. ESCALATION: Break this topic into the smallest possible sub-concepts and teach each independently. Consider if a prerequisite is missing.`;
    }
  }

  if (ranked.length === 0) {
    return {
      recommendedStrategy: 'worked_example',
      confidence: 30,
      reasoning: 'No teaching outcome data yet — defaulting to worked examples.',
      alternativeStrategies: ['visual_diagram', 'step_by_step', 'analogy_based'],
      escalationNeeded,
      escalationMessage,
    };
  }

  const best = ranked[0];
  const alternatives = ranked.slice(1, 4).map(r => r.strategy);

  return {
    recommendedStrategy: best.strategy,
    confidence: Math.min(90, best.uses * 15 + 20),
    reasoning: `"${best.strategy}" has ${best.successRate}% success rate (${best.uses} uses) for ${subjectLower}.`,
    alternativeStrategies: alternatives,
    escalationNeeded,
    escalationMessage,
  };
}

// ============================================================================
//  CONTEXT GENERATION
// ============================================================================

/**
 * Generate teaching outcome context for AI prompt injection.
 */
export function getLearningOutcomeContextPrompt(subject?: string): string {
  const rate = getTeachingSuccessRate(subject);
  
  if (rate.totalTaught === 0) return '';

  const sections: string[] = [];
  sections.push(`## TEACHING OUTCOME FEEDBACK`);
  sections.push(`- Teaching success rate: ${rate.successRate}% (${rate.learnedSuccessfully}/${rate.totalTaught} topics learned successfully)`);

  if (rate.persistentlyDifficult.length > 0) {
    sections.push(`\nPERSISTENTLY DIFFICULT TOPICS (taught multiple times, still not learned):`);
    for (const pd of rate.persistentlyDifficult) {
      sections.push(`- "${pd.topic}" — taught ${pd.attempts}x with [${pd.strategiesUsed.join(', ')}] → STILL NOT LEARNED`);
      sections.push(`  → Try a COMPLETELY DIFFERENT approach. Break it down further or approach from a new angle.`);
    }
  }

  if (rate.quickWins.length > 0) {
    sections.push(`\nQUICK WINS (learned on first attempt): ${rate.quickWins.join(', ')}`);
    sections.push(`→ This student responds well to the strategies used for these topics.`);
  }

  // Add strategy selection recommendation
  const selection = selectBestStrategy({ subject: subject || 'general' });
  if (selection.confidence > 30) {
    sections.push(`\nBEST STRATEGY: ${selection.recommendedStrategy} (${selection.confidence}% confidence) — ${selection.reasoning}`);
  }

  if (selection.escalationNeeded && selection.escalationMessage) {
    sections.push(`\n⚠️ ESCALATION REQUIRED: ${selection.escalationMessage}`);
  }

  return sections.join('\n');
}
