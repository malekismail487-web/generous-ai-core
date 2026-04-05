/**
 * spacedRepetition.ts — Spaced Repetition & Forgetting Curve Engine
 * ==================================================================
 * 
 * Implements a modified SM-2 (SuperMemo) algorithm combined with
 * Ebbinghaus forgetting curve modeling to:
 * - Predict when a student will forget specific knowledge
 * - Schedule optimal review times
 * - Track retention strength per concept
 * - Generate review priority queues
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                 SPACED REPETITION ENGINE                     │
 * ├──────────────────┬──────────────────┬───────────────────────┤
 * │ Forgetting Curve │  SM-2 Scheduler  │  Retention Tracker    │
 * │  (Ebbinghaus)    │  (Review times)  │  (per-concept)        │
 * ├──────────────────┴──────────────────┴───────────────────────┤
 * │               REVIEW PRIORITY QUEUE                          │
 * │  Surfaces concepts most at risk of being forgotten           │
 * ├─────────────────────────────────────────────────────────────-┤
 * │               MASTERY ESTIMATOR                               │
 * │  Tracks long-term retention and concept mastery               │
 * └─────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

/** A concept/fact that is being tracked for spaced repetition */
export interface ReviewItem {
  /** Unique identifier (subject:topic hash) */
  id: string;
  /** Subject area */
  subject: string;
  /** Specific topic or concept */
  topic: string;
  /** SM-2 easiness factor (1.3 - 2.5+) */
  easinessFactor: number;
  /** Current repetition interval in days */
  intervalDays: number;
  /** Number of successful reviews */
  repetitions: number;
  /** Last review timestamp */
  lastReviewedAt: number;
  /** Next scheduled review timestamp */
  nextReviewAt: number;
  /** Number of times the student got this wrong */
  lapses: number;
  /** Current retention estimate (0-100) */
  retentionEstimate: number;
  /** Is this concept considered mastered? */
  mastered: boolean;
  /** Quality history (last 10 review qualities) */
  qualityHistory: number[];
  /** When this item was first encountered */
  firstEncounteredAt: number;
  /** Source: how was this concept introduced */
  source: 'quiz' | 'lecture' | 'chat' | 'flashcard' | 'exam' | 'practice';
}

/** Review quality rating (SM-2 scale) */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
// 0 - Complete blackout
// 1 - Incorrect, but recognized after seeing answer
// 2 - Incorrect, but answer seemed easy to recall
// 3 - Correct with serious difficulty
// 4 - Correct with some hesitation
// 5 - Perfect, instant recall

/** Retention prediction for a specific point in time */
export interface RetentionPrediction {
  itemId: string;
  subject: string;
  topic: string;
  currentRetention: number;     // 0-100
  retentionIn1Day: number;
  retentionIn3Days: number;
  retentionIn7Days: number;
  retentionIn30Days: number;
  optimalReviewTime: number;    // timestamp
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'mastered';
}

/** Summary of the student's overall retention across all subjects */
export interface RetentionSummary {
  totalItemsTracked: number;
  itemsDueForReview: number;
  averageRetention: number;
  subjectRetention: Record<string, {
    itemCount: number;
    averageRetention: number;
    dueCount: number;
    masteredCount: number;
  }>;
  criticalItems: ReviewItem[];
  upcomingReviews: Array<{ item: ReviewItem; dueIn: string }>;
}

// Storage
const REVIEW_STORAGE_KEY = 'lumina_spaced_repetition';

// ============================================================================
//  FORGETTING CURVE MODEL (Ebbinghaus)
// ============================================================================

/**
 * Calculate retention using the Ebbinghaus forgetting curve.
 * R = e^(-t/S) where:
 *   R = retention (0-1)
 *   t = time since last review (in days)
 *   S = stability (how strong the memory is)
 * 
 * Stability increases with each successful review and decreases with lapses.
 */
function calculateRetention(
  daysSinceReview: number,
  stability: number,
): number {
  if (daysSinceReview <= 0) return 100;
  const retention = Math.exp(-daysSinceReview / Math.max(0.5, stability)) * 100;
  return Math.max(0, Math.min(100, Math.round(retention)));
}

/**
 * Calculate memory stability based on review history.
 * Stability = base_interval * easiness_factor * (1 + repetition_bonus)
 */
function calculateStability(item: ReviewItem): number {
  const repetitionBonus = Math.log2(item.repetitions + 1) * 0.5;
  const lapsesPenalty = item.lapses * 0.3;
  const stability = item.intervalDays * item.easinessFactor * (1 + repetitionBonus) - lapsesPenalty;
  return Math.max(1, stability);
}

// ============================================================================
//  SM-2 ALGORITHM
// ============================================================================

/**
 * Apply the SM-2 algorithm to update a review item after a review.
 * 
 * SM-2 rules:
 * 1. If quality >= 3 (correct): increase interval
 *    - If repetition 0: interval = 1 day
 *    - If repetition 1: interval = 6 days
 *    - If repetition > 1: interval = previous_interval * easiness_factor
 * 2. If quality < 3 (incorrect): reset to repetition 0, interval = 1
 * 3. Update easiness factor: EF = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
 *    where q = quality rating
 */
function applySmTwo(item: ReviewItem, quality: ReviewQuality): ReviewItem {
  const updated = { ...item };
  
  // Update easiness factor
  const efDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  updated.easinessFactor = Math.max(1.3, updated.easinessFactor + efDelta);

  if (quality >= 3) {
    // Correct response
    if (updated.repetitions === 0) {
      updated.intervalDays = 1;
    } else if (updated.repetitions === 1) {
      updated.intervalDays = 6;
    } else {
      updated.intervalDays = Math.round(updated.intervalDays * updated.easinessFactor);
    }
    updated.repetitions += 1;
  } else {
    // Incorrect response — reset
    updated.repetitions = 0;
    updated.intervalDays = 1;
    updated.lapses += 1;
  }

  // Cap interval at 365 days
  updated.intervalDays = Math.min(365, updated.intervalDays);

  // Update timestamps
  updated.lastReviewedAt = Date.now();
  updated.nextReviewAt = Date.now() + (updated.intervalDays * 24 * 60 * 60 * 1000);

  // Update quality history
  updated.qualityHistory = [...updated.qualityHistory.slice(-9), quality];

  // Recalculate retention
  updated.retentionEstimate = 100; // just reviewed

  // Check mastery (≥5 successful reviews with average quality ≥ 4)
  const avgQuality = updated.qualityHistory.length > 0
    ? updated.qualityHistory.reduce((a, b) => a + b, 0) / updated.qualityHistory.length
    : 0;
  updated.mastered = updated.repetitions >= 5 && avgQuality >= 4 && updated.lapses <= 1;

  return updated;
}

// ============================================================================
//  STORAGE
// ============================================================================

function getStoredItems(): Map<string, ReviewItem> {
  try {
    const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
    if (raw) {
      const arr: ReviewItem[] = JSON.parse(raw);
      return new Map(arr.map(item => [item.id, item]));
    }
  } catch { /* ignore */ }
  return new Map();
}

function storeItems(items: Map<string, ReviewItem>): void {
  try {
    const arr = Array.from(items.values());
    // Keep only items that were reviewed in the last 180 days or have high retention
    const cutoff = Date.now() - (180 * 24 * 60 * 60 * 1000);
    const filtered = arr.filter(item => 
      item.lastReviewedAt > cutoff || item.retentionEstimate > 50
    );
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(filtered));
  } catch { /* ignore */ }
}

function generateItemId(subject: string, topic: string): string {
  return `${subject.toLowerCase().replace(/\s+/g, '_')}:${topic.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
}

// ============================================================================
//  PUBLIC API
// ============================================================================

/**
 * Record an encounter with a concept (first time or review).
 * Maps review quality from accuracy/performance signals.
 */
export function recordConceptEncounter(params: {
  subject: string;
  topic: string;
  quality: ReviewQuality;
  source: ReviewItem['source'];
}): ReviewItem {
  const items = getStoredItems();
  const id = generateItemId(params.subject, params.topic);

  let item = items.get(id);
  
  if (!item) {
    // New concept — create entry
    item = {
      id,
      subject: params.subject.toLowerCase(),
      topic: params.topic,
      easinessFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      lastReviewedAt: Date.now(),
      nextReviewAt: Date.now() + (24 * 60 * 60 * 1000),
      lapses: 0,
      retentionEstimate: 100,
      mastered: false,
      qualityHistory: [params.quality],
      firstEncounteredAt: Date.now(),
      source: params.source,
    };
  }

  // Apply SM-2 update
  item = applySmTwo(item, params.quality);
  items.set(id, item);
  storeItems(items);

  return item;
}

/**
 * Map a correct/incorrect answer to a SM-2 quality rating.
 */
export function mapAnswerToQuality(
  isCorrect: boolean,
  responseTimeSeconds?: number,
  difficulty?: string,
): ReviewQuality {
  if (!isCorrect) {
    // Wrong: 0 (complete blackout) to 2 (seemed familiar)
    return responseTimeSeconds && responseTimeSeconds < 5 ? 1 : 0;
  }

  // Correct
  if (responseTimeSeconds) {
    if (responseTimeSeconds < 5) return 5;    // instant recall
    if (responseTimeSeconds < 15) return 4;   // some hesitation
    if (responseTimeSeconds < 30) return 3;   // serious difficulty
    return 3;
  }

  // No timing data: use difficulty as proxy
  if (difficulty === 'easy') return 5;
  if (difficulty === 'hard') return 3;
  return 4;
}

/**
 * Get all items that are due for review right now.
 */
export function getDueItems(subject?: string): ReviewItem[] {
  const items = getStoredItems();
  const now = Date.now();
  
  let dueItems = Array.from(items.values())
    .filter(item => item.nextReviewAt <= now && !item.mastered);

  if (subject) {
    dueItems = dueItems.filter(item => item.subject === subject.toLowerCase());
  }

  // Sort by urgency (most overdue first)
  return dueItems.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

/**
 * Get retention predictions for all tracked items.
 */
export function getRetentionPredictions(subject?: string): RetentionPrediction[] {
  const items = getStoredItems();
  const now = Date.now();

  let itemList = Array.from(items.values());
  if (subject) {
    itemList = itemList.filter(item => item.subject === subject.toLowerCase());
  }

  return itemList.map(item => {
    const stability = calculateStability(item);
    const daysSince = (now - item.lastReviewedAt) / (1000 * 60 * 60 * 24);
    
    const currentRetention = calculateRetention(daysSince, stability);
    const retentionIn1Day = calculateRetention(daysSince + 1, stability);
    const retentionIn3Days = calculateRetention(daysSince + 3, stability);
    const retentionIn7Days = calculateRetention(daysSince + 7, stability);
    const retentionIn30Days = calculateRetention(daysSince + 30, stability);

    // Determine urgency
    let urgency: RetentionPrediction['urgency'];
    if (item.mastered) urgency = 'mastered';
    else if (currentRetention < 30) urgency = 'critical';
    else if (currentRetention < 50) urgency = 'high';
    else if (currentRetention < 70) urgency = 'medium';
    else urgency = 'low';

    return {
      itemId: item.id,
      subject: item.subject,
      topic: item.topic,
      currentRetention,
      retentionIn1Day,
      retentionIn3Days,
      retentionIn7Days,
      retentionIn30Days,
      optimalReviewTime: item.nextReviewAt,
      urgency,
    };
  });
}

/**
 * Get a comprehensive retention summary across all subjects.
 */
export function getRetentionSummary(): RetentionSummary {
  const items = getStoredItems();
  const now = Date.now();
  const allItems = Array.from(items.values());

  // Update retention estimates
  for (const item of allItems) {
    const stability = calculateStability(item);
    const daysSince = (now - item.lastReviewedAt) / (1000 * 60 * 60 * 24);
    item.retentionEstimate = calculateRetention(daysSince, stability);
  }

  const dueItems = allItems.filter(item => item.nextReviewAt <= now && !item.mastered);
  const avgRetention = allItems.length > 0
    ? Math.round(allItems.reduce((sum, i) => sum + i.retentionEstimate, 0) / allItems.length)
    : 100;

  // Per-subject breakdown
  const subjectRetention: RetentionSummary['subjectRetention'] = {};
  for (const item of allItems) {
    if (!subjectRetention[item.subject]) {
      subjectRetention[item.subject] = {
        itemCount: 0,
        averageRetention: 0,
        dueCount: 0,
        masteredCount: 0,
      };
    }
    const sr = subjectRetention[item.subject];
    sr.itemCount++;
    sr.averageRetention += item.retentionEstimate;
    if (item.nextReviewAt <= now && !item.mastered) sr.dueCount++;
    if (item.mastered) sr.masteredCount++;
  }

  for (const sr of Object.values(subjectRetention)) {
    sr.averageRetention = sr.itemCount > 0 ? Math.round(sr.averageRetention / sr.itemCount) : 100;
  }

  // Critical items (retention < 40%)
  const criticalItems = allItems
    .filter(item => item.retentionEstimate < 40 && !item.mastered)
    .sort((a, b) => a.retentionEstimate - b.retentionEstimate)
    .slice(0, 10);

  // Upcoming reviews
  const upcomingReviews = allItems
    .filter(item => item.nextReviewAt > now && !item.mastered)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
    .slice(0, 10)
    .map(item => {
      const dueIn = formatTimeUntil(item.nextReviewAt - now);
      return { item, dueIn };
    });

  return {
    totalItemsTracked: allItems.length,
    itemsDueForReview: dueItems.length,
    averageRetention: avgRetention,
    subjectRetention,
    criticalItems,
    upcomingReviews,
  };
}

/**
 * Generate a spaced repetition context string for AI prompt injection.
 */
export function getSpacedRepetitionContextPrompt(subject?: string): string {
  const summary = getRetentionSummary();
  const predictions = getRetentionPredictions(subject);
  
  if (summary.totalItemsTracked === 0) {
    return ''; // No data yet
  }

  const sections: string[] = [];
  sections.push(`## MEMORY & RETENTION STATUS`);
  sections.push(`- Tracking ${summary.totalItemsTracked} concepts | ${summary.itemsDueForReview} due for review`);
  sections.push(`- Average retention: ${summary.averageRetention}%`);

  if (subject) {
    const sr = summary.subjectRetention[subject.toLowerCase()];
    if (sr) {
      sections.push(`- ${subject}: ${sr.averageRetention}% retention, ${sr.dueCount} due, ${sr.masteredCount} mastered`);
    }
  }

  // Critical items the AI should reinforce
  const criticalInSubject = predictions
    .filter(p => p.urgency === 'critical' || p.urgency === 'high')
    .slice(0, 5);
  
  if (criticalInSubject.length > 0) {
    sections.push(`\nFADING MEMORIES (reinforce these when naturally relevant):`);
    for (const pred of criticalInSubject) {
      sections.push(`- "${pred.topic}" (${pred.subject}): ${pred.currentRetention}% retention — will drop to ${pred.retentionIn3Days}% in 3 days`);
    }
    sections.push(`When discussing related topics, naturally reference these fading concepts to reinforce them.`);
  }

  // Concepts approaching mastery (positive reinforcement)
  const nearMastery = predictions.filter(p => p.currentRetention > 85 && p.urgency !== 'mastered').slice(0, 3);
  if (nearMastery.length > 0) {
    sections.push(`\nNEAR MASTERY (acknowledge progress when relevant):`);
    for (const pred of nearMastery) {
      sections.push(`- "${pred.topic}" (${pred.subject}): ${pred.currentRetention}% — almost mastered!`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
//  UTILITIES
// ============================================================================

function formatTimeUntil(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  if (days === 1) return '1 day';
  return `${days} days`;
}
