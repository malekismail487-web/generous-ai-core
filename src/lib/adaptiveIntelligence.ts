/**
 * adaptiveIntelligence.ts
 * 
 * Comprehensive Adaptive Intelligence Engine for Lumina
 * =====================================================
 * 
 * This module serves as the central brain of Lumina's adaptive learning system.
 * It aggregates data from ALL student interactions — chat messages, quiz answers,
 * lecture views, assignment submissions, flashcard usage, and behavioral patterns —
 * then synthesizes that data into actionable intelligence that shapes every AI response.
 * 
 * The engine operates on three pillars:
 *   1. DATA COLLECTION — Recording every interaction as a learning signal
 *   2. PATTERN ANALYSIS — Identifying trends, strengths, weaknesses, and preferences
 *   3. CONTEXT INJECTION — Generating rich, personalized context for AI prompts
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                    ADAPTIVE INTELLIGENCE ENGINE                          │
 * ├──────────────┬──────────────┬───────────────┬───────────────────────────┤
 * │  Chat Data   │  Quiz Data   │ Activity Data │  Behavioral Data          │
 * │  (messages)  │  (answers)   │  (views/time) │  (modality prefs)         │
 * ├──────────────┴──────────────┴───────────────┴───────────────────────────┤
 * │                    SUBSYSTEM ORCHESTRATOR                                │
 * │  ┌────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │
 * │  │ Cognitive   │ │  Spaced     │ │  Mistake     │ │  Predictive      │  │
 * │  │ Model       │ │  Repetition │ │  Analyzer    │ │  Engine          │  │
 * │  └────────────┘ └─────────────┘ └──────────────┘ └──────────────────┘  │
 * │  ┌────────────┐ ┌─────────────┐ ┌──────────────┐                       │
 * │  │ Emotional   │ │  Concept    │ │  Rule        │                       │
 * │  │ State       │ │  Graph      │ │  Generator   │                       │
 * │  └────────────┘ └─────────────┘ └──────────────┘                       │
 * ├────────────────────────────────────────────────────────────────────────┤
 * │                    CONTEXT GENERATOR                                     │
 * │  Produces personalized prompts for every AI feature                      │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { supabase } from '@/integrations/supabase/client';
import { getStoredBehavior, type BehavioralDataPoint, type ContentModality } from '@/hooks/useActivityTracker';

// === Subsystem Imports ===
import { computeCognitiveState, getCognitiveContextPrompt, recordCognitiveEventByType, type CognitiveState } from '@/lib/adaptive/cognitiveModel';
import { getSpacedRepetitionContextPrompt, getRetentionSummary, recordConceptEncounter, mapAnswerToQuality, getDueItems, type RetentionSummary } from '@/lib/adaptive/spacedRepetition';
import { analyzeMistakePatterns, getMistakePatternContextPrompt, recordMistake, classifyMistake, type MistakeAnalysis } from '@/lib/adaptive/mistakeAnalyzer';
import { calculateLearningVelocity, forecastPerformance, analyzeCrossSubjectTransfer, modelGrowthTrajectory, getPredictiveContextPrompt, recordPerformanceSession, type LearningVelocity, type PerformanceForecast, type GrowthTrajectory, type CrossSubjectTransfer } from '@/lib/adaptive/predictiveEngine';
import { computeEmotionalProfile, getEmotionalContextPrompt, recordEmotionalSignal, detectEmotionFromText, type EmotionalProfile } from '@/lib/adaptive/emotionalStateEngine';
import { analyzeConceptGraph, getConceptGraphContextPrompt, type ConceptGraphAnalysis } from '@/lib/adaptive/conceptGraph';
import { generateTeachingRules, generateSocraticQuestions, optimizeStudySession, getRulesContextPrompt, type TeachingRule, type SocraticQuestion, type SessionPlan } from '@/lib/adaptive/ruleGenerator';

// === NEW Subsystem Imports (Self-Learning Teaching Engine) ===
import { recordTeachingStrategy, recordStrategyOutcome, getTeachingStrategyContextPrompt, inferStrategyFromContent, type TeachingStrategy } from '@/lib/adaptive/teachingStrategyTracker';
import { getCrossDomainContextPrompt, detectErrorTransfer, getCrossDomainRecommendations } from '@/lib/adaptive/crossDomainTransfer';
import { recordTeaching, recordLearningOutcome, getLearningOutcomeContextPrompt, selectBestStrategy } from '@/lib/adaptive/learningOutcomeLoop';

// ============================================================================
//  TYPES & INTERFACES
// ============================================================================

/** Represents a student's performance snapshot for a single subject */
export interface SubjectPerformance {
  subject: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;           // 0-100
  recentAccuracy: number;     // last 20 answers, 0-100
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  strongTopics: string[];     // topics where accuracy > 80%
  weakTopics: string[];       // topics where accuracy < 50%
  trend: 'improving' | 'stable' | 'declining';
  lastPracticed: string | null;
  averageResponseTime: number | null; // seconds
}

/** Represents the student's overall learning profile across all data sources */
export interface StudentIntelligenceProfile {
  // Academic performance
  overallAccuracy: number;
  subjectPerformances: SubjectPerformance[];
  strongestSubjects: string[];
  weakestSubjects: string[];
  
  // Learning style (from behavioral analysis)
  dominantStyle: ContentModality | 'balanced';
  secondaryStyle: ContentModality | null;
  styleScores: Record<ContentModality, number>;
  styleConfidence: number; // 0-100
  
  // Difficulty calibration
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  
  // Knowledge gaps
  activeGaps: Array<{
    subject: string;
    topic: string;
    severity: 'minor' | 'moderate' | 'critical';
    description: string;
  }>;
  
  // Engagement patterns
  totalInteractions: number;
  preferredStudyTopics: string[];
  recentlyStudiedTopics: string[];
  daysSinceLastActivity: Record<string, number>;
  
  // Memory context (from student_memory table)
  relevantMemories: string[];
  
  // === SUBSYSTEM DATA ===
  cognitiveState: CognitiveState | null;
  emotionalProfile: EmotionalProfile | null;
  mistakeAnalysis: MistakeAnalysis | null;
  learningVelocity: LearningVelocity | null;
  performanceForecasts: PerformanceForecast[];
  growthTrajectory: GrowthTrajectory | null;
  crossSubjectTransfers: CrossSubjectTransfer[];
  retentionSummary: RetentionSummary | null;
  conceptGraphAnalysis: ConceptGraphAnalysis | null;
  teachingRules: TeachingRule[];
  socraticQuestions: SocraticQuestion[];
  sessionPlan: SessionPlan | null;
  
  // Meta
  profileCompleteness: number; // 0-100, how much data we have
  lastUpdated: string;
}

/** Configuration for generating adaptive context for different feature types */
export type FeatureType = 
  | 'notes'
  | 'sat_prep'
  | 'flashcards'
  | 'file_analysis'
  | 'study_plan'
  | 'practice_quiz'
  | 'lecture'
  | 'chat'
  | 'exam'
  | 'podcast'
  | 'mind_map';

// ============================================================================
//  DATA COLLECTION — Fetching raw data from all sources
// ============================================================================

/**
 * Fetch answer history for a specific user.
 * This includes answers from quizzes, exams, assignments, and practice sessions.
 */
async function fetchAnswerHistory(userId: string, limit = 500): Promise<Array<{
  subject: string;
  is_correct: boolean;
  difficulty: string;
  source: string;
  question_text: string | null;
  student_answer: string | null;
  correct_answer: string | null;
  created_at: string;
}>> {
  const { data } = await supabase
    .from('student_answer_history')
    .select('subject, is_correct, difficulty, source, question_text, student_answer, correct_answer, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

/**
 * Fetch the student's learning profiles (per-subject difficulty levels).
 */
async function fetchLearningProfiles(userId: string): Promise<Array<{
  subject: string;
  difficulty_level: string;
  total_questions_answered: number;
  correct_answers: number;
  recent_accuracy: number;
}>> {
  const { data } = await supabase
    .from('student_learning_profiles')
    .select('subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy')
    .eq('user_id', userId);
  return (data || []).map(p => ({
    ...p,
    recent_accuracy: Number(p.recent_accuracy),
  }));
}

/**
 * Fetch active knowledge gaps.
 */
async function fetchKnowledgeGaps(userId: string): Promise<Array<{
  subject: string;
  topic: string;
  severity: string;
  gap_description: string;
}>> {
  const { data } = await supabase
    .from('knowledge_gaps')
    .select('subject, topic, severity, gap_description')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}

/**
 * Fetch relevant memories from long-term memory.
 */
async function fetchStudentMemories(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('student_memory')
    .select('content, memory_type, confidence')
    .eq('user_id', userId)
    .order('confidence', { ascending: false })
    .limit(15);
  
  if (!data || data.length === 0) return [];
  
  return data.map(m => {
    const prefix = m.memory_type === 'preference' ? '🎯' 
      : m.memory_type === 'struggle' ? '⚠️'
      : m.memory_type === 'strength' ? '💪'
      : m.memory_type === 'personality' ? '🧑'
      : '📌';
    return `${prefix} ${m.content}`;
  });
}

/**
 * Fetch recent chat messages to understand what the student has been discussing.
 */
async function fetchRecentChatTopics(userId: string): Promise<string[]> {
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(5);
  
  if (!conversations || conversations.length === 0) return [];
  
  const topics: string[] = [];
  for (const conv of conversations) {
    if (conv.title && conv.title !== 'New Chat') {
      topics.push(conv.title);
    }
  }
  
  // Also get actual recent messages for deeper topic extraction
  const convIds = conversations.map(c => c.id);
  if (convIds.length > 0) {
    const { data: messages } = await supabase
      .from('messages')
      .select('content, role')
      .in('conversation_id', convIds)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (messages) {
      const topicKeywords = extractTopicKeywords(messages.map(m => m.content));
      topics.push(...topicKeywords);
    }
  }
  
  return [...new Set(topics)].slice(0, 10);
}

// ============================================================================
//  PATTERN ANALYSIS — Making sense of raw data
// ============================================================================

/**
 * Extract topic keywords from a set of messages.
 */
function extractTopicKeywords(messages: string[]): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'must', 'need', 'dare',
    'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'i', 'me', 'my', 'you', 'your', 'he', 'she', 'it', 'we', 'they',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'how', 'when', 'where', 'why', 'if', 'then', 'than', 'because',
    'please', 'help', 'explain', 'tell', 'show', 'give', 'make', 'want',
    'know', 'think', 'like', 'just', 'also', 'very', 'really', 'much',
    'more', 'some', 'any', 'all', 'each', 'every', 'other', 'no', 'yes',
    'hi', 'hello', 'hey', 'thanks', 'thank', 'ok', 'okay', 'sure',
    'can', 'could', 'would', 'question', 'answer', 'understand', 'mean',
  ]);

  const wordFreq: Record<string, number> = {};
  
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  // Also extract bigrams (two-word phrases)
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      wordFreq[bigram] = (wordFreq[bigram] || 0) + 2;
    }
  }

  return Object.entries(wordFreq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/**
 * Analyze answer history to determine per-subject performance trends.
 */
function analyzeSubjectPerformance(
  answers: Awaited<ReturnType<typeof fetchAnswerHistory>>,
  profiles: Awaited<ReturnType<typeof fetchLearningProfiles>>,
): SubjectPerformance[] {
  const subjectMap: Record<string, typeof answers> = {};
  
  for (const answer of answers) {
    const subj = answer.subject.toLowerCase();
    if (!subjectMap[subj]) subjectMap[subj] = [];
    subjectMap[subj].push(answer);
  }

  const performances: SubjectPerformance[] = [];

  for (const [subject, subjectAnswers] of Object.entries(subjectMap)) {
    const total = subjectAnswers.length;
    const correct = subjectAnswers.filter(a => a.is_correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Recent accuracy (last 20 answers)
    const recent = subjectAnswers.slice(0, 20);
    const recentCorrect = recent.filter(a => a.is_correct).length;
    const recentAccuracy = recent.length > 0 ? Math.round((recentCorrect / recent.length) * 100) : accuracy;

    // Determine trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (total >= 10) {
      const diff = recentAccuracy - accuracy;
      if (diff > 10) trend = 'improving';
      else if (diff < -10) trend = 'declining';
    }

    // Strong and weak topics from question text
    const topicAccuracy: Record<string, { correct: number; total: number }> = {};
    for (const answer of subjectAnswers) {
      if (!answer.question_text) continue;
      const topic = answer.question_text.slice(0, 60).replace(/[?!.]/g, '').trim();
      if (topic.length < 5) continue;
      if (!topicAccuracy[topic]) topicAccuracy[topic] = { correct: 0, total: 0 };
      topicAccuracy[topic].total++;
      if (answer.is_correct) topicAccuracy[topic].correct++;
    }

    const strongTopics: string[] = [];
    const weakTopics: string[] = [];
    for (const [topic, stats] of Object.entries(topicAccuracy)) {
      if (stats.total < 2) continue;
      const topicAcc = (stats.correct / stats.total) * 100;
      if (topicAcc >= 80) strongTopics.push(topic);
      else if (topicAcc <= 50) weakTopics.push(topic);
    }

    // Get difficulty level from profiles
    const profile = profiles.find(p => p.subject === subject);
    const difficultyLevel = (profile?.difficulty_level as SubjectPerformance['difficultyLevel']) || 
      (recentAccuracy >= 85 ? 'advanced' : recentAccuracy >= 55 ? 'intermediate' : 'beginner');

    const lastPracticed = subjectAnswers[0]?.created_at || null;

    performances.push({
      subject,
      totalQuestions: total,
      correctAnswers: correct,
      accuracy,
      recentAccuracy,
      difficultyLevel,
      strongTopics: strongTopics.slice(0, 5),
      weakTopics: weakTopics.slice(0, 5),
      trend,
      lastPracticed,
      averageResponseTime: null,
    });
  }

  return performances.sort((a, b) => b.totalQuestions - a.totalQuestions);
}

/**
 * Analyze behavioral data to determine learning style scores.
 */
function analyzeLearningStyle(dataPoints: BehavioralDataPoint[]): {
  dominant: ContentModality | 'balanced';
  secondary: ContentModality | null;
  scores: Record<ContentModality, number>;
  confidence: number;
} {
  const modalities: ContentModality[] = ['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'];
  const weights: Record<ContentModality, number> = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };

  for (const dp of dataPoints) {
    weights[dp.modality] += dp.weight;
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const scores: Record<ContentModality, number> = {} as any;
  for (const m of modalities) {
    scores[m] = Math.round((Math.max(0, weights[m]) / totalWeight) * 100);
  }

  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  if (sum !== 100 && sum > 0) {
    const maxKey = modalities.reduce((a, b) => scores[a] >= scores[b] ? a : b);
    scores[maxKey] += (100 - sum);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][1] > 25 ? sorted[0][0] as ContentModality : 'balanced';
  const secondary = sorted[1][1] > 20 ? sorted[1][0] as ContentModality : null;
  const confidence = Math.min(100, Math.round((dataPoints.length / 100) * 100));

  return { dominant, secondary, scores, confidence };
}

/**
 * Calculate how many days since a subject was last practiced.
 */
function calculateInactivityDays(performances: SubjectPerformance[]): Record<string, number> {
  const now = Date.now();
  const result: Record<string, number> = {};
  
  for (const p of performances) {
    if (p.lastPracticed) {
      const lastDate = new Date(p.lastPracticed).getTime();
      result[p.subject] = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }
  }
  
  return result;
}

// ============================================================================
//  SUBSYSTEM ORCHESTRATION — Run all subsystems and collect their output
// ============================================================================

/**
 * Feed answer history into all subsystems so they have data to analyze.
 * This is called once during profile building to hydrate local engines.
 */
function hydrateSubsystemsFromHistory(
  answers: Awaited<ReturnType<typeof fetchAnswerHistory>>,
  subjectPerformances: SubjectPerformance[],
): void {
  const recentAnswers = answers.slice(0, 100);
  
  for (const answer of recentAnswers) {
    if (!answer.is_correct && answer.question_text && answer.student_answer && answer.correct_answer) {
      try {
        recordMistake({
          subject: answer.subject,
          topic: answer.question_text.slice(0, 60),
          questionText: answer.question_text,
          studentAnswer: answer.student_answer,
          correctAnswer: answer.correct_answer,
          wasQuickAnswer: false,
          historicalAccuracyOnTopic: subjectPerformances.find(p => p.subject === answer.subject.toLowerCase())?.accuracy || 50,
          isNewTopicFormat: false,
        });
      } catch { /* already recorded */ }
    }

    if (answer.question_text) {
      try {
        const quality = mapAnswerToQuality(answer.is_correct, answer.difficulty as any, null);
        recordConceptEncounter({
          subject: answer.subject,
          topic: answer.question_text.slice(0, 60),
          quality,
          source: (answer.source as any) || 'quiz',
        });
      } catch { /* ignore duplicates */ }
    }
  }

  for (const perf of subjectPerformances) {
    if (perf.totalQuestions >= 3) {
      try {
        recordPerformanceSession({
          subject: perf.subject,
          accuracy: perf.recentAccuracy,
          questionsAnswered: Math.min(perf.totalQuestions, 20),
          sessionDurationMinutes: 15,
        });
      } catch { /* ignore */ }
    }
  }

  const last10 = answers.slice(0, 10);
  const last10Correct = last10.filter(a => a.is_correct).length;
  const recentRate = last10.length > 0 ? last10Correct / last10.length : 0.5;
  
  if (recentRate < 0.3) {
    recordCognitiveEventByType('consecutive_errors');
  } else if (recentRate > 0.8) {
    recordCognitiveEventByType('consecutive_correct');
  }
}

/**
 * Run all subsystems and collect their analysis results.
 */
function runSubsystems(
  answers: Awaited<ReturnType<typeof fetchAnswerHistory>>,
  subjectPerformances: SubjectPerformance[],
  gaps: Array<{ subject: string; topic: string; severity: string; gap_description: string }>,
): {
  cognitiveState: CognitiveState | null;
  emotionalProfile: EmotionalProfile | null;
  mistakeAnalysis: MistakeAnalysis | null;
  learningVelocity: LearningVelocity | null;
  performanceForecasts: PerformanceForecast[];
  growthTrajectory: GrowthTrajectory | null;
  crossSubjectTransfers: CrossSubjectTransfer[];
  retentionSummary: RetentionSummary | null;
  conceptGraphAnalysis: ConceptGraphAnalysis | null;
  teachingRules: TeachingRule[];
  socraticQuestions: SocraticQuestion[];
  sessionPlan: SessionPlan | null;
} {
  // Compute overall recent accuracy for cognitive model
  const last20 = answers.slice(0, 20);
  const last20Correct = last20.filter(a => a.is_correct).length;
  const recentAccuracy = last20.length > 0 ? Math.round((last20Correct / last20.length) * 100) : 60;

  // 1. Cognitive Model
  let cognitiveState: CognitiveState | null = null;
  try {
    cognitiveState = computeCognitiveState(recentAccuracy);
  } catch { /* graceful fallback */ }

  // 2. Emotional Profile
  let emotionalProfile: EmotionalProfile | null = null;
  try {
    emotionalProfile = computeEmotionalProfile();
  } catch { /* graceful fallback */ }

  // 3. Mistake Analysis (per subject + overall)
  let mistakeAnalysis: MistakeAnalysis | null = null;
  try {
    mistakeAnalysis = analyzeMistakePatterns();
  } catch { /* graceful fallback */ }

  // 4. Learning Velocity
  let learningVelocity: LearningVelocity | null = null;
  try {
    const answerData = answers.map(a => ({ subject: a.subject, is_correct: a.is_correct, created_at: a.created_at }));
    learningVelocity = calculateLearningVelocity(answerData);
  } catch { /* graceful fallback */ }

  // 5. Performance Forecasts
  const performanceForecasts: PerformanceForecast[] = [];
  try {
    const answerData = answers.map(a => ({ subject: a.subject, is_correct: a.is_correct, created_at: a.created_at }));
    const allForecasts = forecastPerformance(answerData);
    performanceForecasts.push(...allForecasts);
  } catch { /* skip */ }

  // 6. Growth Trajectory
  let growthTrajectory: GrowthTrajectory | null = null;
  try {
    const answerData = answers.map(a => ({ subject: a.subject, is_correct: a.is_correct, created_at: a.created_at }));
    growthTrajectory = modelGrowthTrajectory(answerData);
  } catch { /* graceful fallback */ }

  // 7. Cross-Subject Transfer
  const crossSubjectTransfers: CrossSubjectTransfer[] = [];
  try {
    const answerData = answers.map(a => ({ subject: a.subject, is_correct: a.is_correct, created_at: a.created_at }));
    const transfers = analyzeCrossSubjectTransfer(answerData);
    crossSubjectTransfers.push(...transfers);
  } catch { /* skip */ }

  // 8. Retention Summary
  let retentionSummary: RetentionSummary | null = null;
  try {
    retentionSummary = getRetentionSummary();
  } catch { /* graceful fallback */ }

  // 9. Concept Graph Analysis
  let conceptGraphAnalysis: ConceptGraphAnalysis | null = null;
  try {
    const perfData = subjectPerformances.map(p => ({
      subject: p.subject,
      accuracy: p.recentAccuracy,
      strongTopics: p.strongTopics,
      weakTopics: p.weakTopics,
    }));
    const gapTopics = gaps.map(g => ({ subject: g.subject, topic: g.topic, severity: g.severity }));
    conceptGraphAnalysis = analyzeConceptGraph(perfData, gapTopics);
  } catch { /* graceful fallback */ }

  // 10. Teaching Rules
  let teachingRules: TeachingRule[] = [];
  try {
    if (mistakeAnalysis && emotionalProfile && cognitiveState && learningVelocity && growthTrajectory && retentionSummary) {
      teachingRules = generateTeachingRules({
        mistakeAnalysis,
        emotionalProfile,
        cognitiveState,
        learningVelocity,
        growthTrajectory,
        retentionSummary,
        dominantLearningStyle: 'balanced',
        overallAccuracy: recentAccuracy,
        activeSubjects: subjectPerformances.map(p => p.subject),
      });
    }
  } catch { /* graceful fallback */ }

  // 11. Socratic Questions
  let socraticQuestions: SocraticQuestion[] = [];
  try {
    const weakPerf = subjectPerformances.filter(p => p.recentAccuracy < 60);
    if (weakPerf.length > 0) {
      const targetSubject = weakPerf[0];
      socraticQuestions = generateSocraticQuestions({
        subject: targetSubject.subject,
        currentTopic: targetSubject.weakTopics[0] || targetSubject.subject,
        weakTopics: targetSubject.weakTopics,
        strongTopics: targetSubject.strongTopics,
        knowledgeGaps: gaps.slice(0, 5).map(g => ({ topic: g.topic, description: g.gap_description })),
        difficulty: targetSubject.difficultyLevel,
      });
    }
  } catch { /* graceful fallback */ }

  // 12. Session Plan
  let sessionPlan: SessionPlan | null = null;
  try {
    if (cognitiveState && retentionSummary && emotionalProfile) {
      const dueItems = getDueItems();
      sessionPlan = optimizeStudySession({
        availableMinutes: 45,
        cognitiveState,
        retentionSummary,
        weakSubjects: subjectPerformances.filter(p => p.recentAccuracy < 60).map(p => p.subject),
        strongSubjects: subjectPerformances.filter(p => p.recentAccuracy >= 80).map(p => p.subject),
        dueReviewItems: dueItems.map(i => `${i.subject}: ${i.topic}`),
        emotionalProfile,
        bestStudyTime: 'now',
      });
    }
  } catch { /* graceful fallback */ }

  return {
    cognitiveState,
    emotionalProfile,
    mistakeAnalysis,
    learningVelocity,
    performanceForecasts,
    growthTrajectory,
    crossSubjectTransfers,
    retentionSummary,
    conceptGraphAnalysis,
    teachingRules,
    socraticQuestions,
    sessionPlan,
  };
}

// ============================================================================
//  FULL PROFILE BUILDER — Assembles the complete intelligence profile
// ============================================================================

/**
 * Build a comprehensive intelligence profile for a student.
 * This is the main entry point that aggregates all data sources
 * AND runs all 7 subsystems.
 */
export async function buildIntelligenceProfile(userId: string): Promise<StudentIntelligenceProfile> {
  // Fetch all data sources in parallel
  const [answers, profiles, gaps, memories, recentTopics, behaviorData] = await Promise.all([
    fetchAnswerHistory(userId),
    fetchLearningProfiles(userId),
    fetchKnowledgeGaps(userId),
    fetchStudentMemories(userId),
    fetchRecentChatTopics(userId),
    Promise.resolve(getStoredBehavior()),
  ]);

  // Analyze subject performance
  const subjectPerformances = analyzeSubjectPerformance(answers, profiles);
  
  // Calculate overall accuracy
  const totalQuestions = subjectPerformances.reduce((sum, p) => sum + p.totalQuestions, 0);
  const totalCorrect = subjectPerformances.reduce((sum, p) => sum + p.correctAnswers, 0);
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 50;

  // Determine strongest and weakest subjects
  const sortedByAccuracy = [...subjectPerformances]
    .filter(p => p.totalQuestions >= 5)
    .sort((a, b) => b.recentAccuracy - a.recentAccuracy);
  
  const strongestSubjects = sortedByAccuracy.slice(0, 3).map(p => p.subject);
  const weakestSubjects = sortedByAccuracy.slice(-3).reverse().map(p => p.subject);

  // Analyze learning style from behavioral data
  const styleAnalysis = analyzeLearningStyle(behaviorData.dataPoints);

  // Determine overall difficulty level
  let overallLevel: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
  if (profiles.length > 0) {
    const levelCounts: Record<string, number> = {};
    for (const p of profiles) {
      levelCounts[p.difficulty_level] = (levelCounts[p.difficulty_level] || 0) + 1;
    }
    const topLevel = Object.entries(levelCounts).sort((a, b) => b[1] - a[1])[0];
    if (topLevel) overallLevel = topLevel[0] as typeof overallLevel;
  } else if (overallAccuracy >= 85) {
    overallLevel = 'advanced';
  } else if (overallAccuracy < 55) {
    overallLevel = 'beginner';
  }

  // Inactivity tracking
  const daysSinceLastActivity = calculateInactivityDays(subjectPerformances);

  // === SUBSYSTEM ORCHESTRATION ===
  // Hydrate subsystems with historical data, then run them
  hydrateSubsystemsFromHistory(answers, subjectPerformances);
  const subsystemResults = runSubsystems(answers, subjectPerformances, gaps);

  // Profile completeness score
  let completeness = 0;
  if (totalQuestions > 0) completeness += 15;
  if (totalQuestions >= 20) completeness += 10;
  if (totalQuestions >= 100) completeness += 5;
  if (behaviorData.dataPoints.length >= 20) completeness += 15;
  if (memories.length > 0) completeness += 10;
  if (recentTopics.length > 0) completeness += 5;
  if (gaps.length >= 0) completeness += 5;
  if (profiles.length > 0) completeness += 5;
  if (subsystemResults.cognitiveState) completeness += 5;
  if (subsystemResults.emotionalProfile) completeness += 5;
  if (subsystemResults.mistakeAnalysis && subsystemResults.mistakeAnalysis.totalMistakes > 0) completeness += 5;
  if (subsystemResults.learningVelocity) completeness += 5;
  if (subsystemResults.retentionSummary) completeness += 5;
  if (subsystemResults.teachingRules.length > 0) completeness += 5;

  return {
    overallAccuracy,
    subjectPerformances,
    strongestSubjects,
    weakestSubjects,
    dominantStyle: styleAnalysis.dominant,
    secondaryStyle: styleAnalysis.secondary,
    styleScores: styleAnalysis.scores,
    styleConfidence: styleAnalysis.confidence,
    overallLevel,
    activeGaps: gaps.map(g => ({
      subject: g.subject,
      topic: g.topic,
      severity: g.severity as 'minor' | 'moderate' | 'critical',
      description: g.gap_description,
    })),
    totalInteractions: behaviorData.totalInteractions + totalQuestions,
    preferredStudyTopics: recentTopics,
    recentlyStudiedTopics: subjectPerformances.slice(0, 5).map(p => p.subject),
    daysSinceLastActivity,
    relevantMemories: memories,
    // Subsystem data
    ...subsystemResults,
    profileCompleteness: Math.min(100, completeness),
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
//  CONTEXT GENERATION — Producing rich prompts for AI features
// ============================================================================

/**
 * Generate the difficulty-level instruction string.
 */
function getDifficultyInstruction(level: 'beginner' | 'intermediate' | 'advanced'): string {
  const instructions: Record<string, string> = {
    beginner: `DIFFICULTY LEVEL: BEGINNER
- Use simple, everyday language. Avoid jargon entirely or define it immediately.
- Break every concept into the smallest possible steps.
- Use analogies to real-world objects and experiences the student already knows.
- Provide many basic examples before any challenging ones.
- Assume minimal prior knowledge of the subject.
- Celebrate small wins and build confidence with encouraging language.
- Use visual aids (ASCII diagrams, tables) extensively.`,

    intermediate: `DIFFICULTY LEVEL: INTERMEDIATE
- Use standard academic language with technical terms introduced naturally.
- Provide moderate depth — explain the "why" behind concepts.
- Include a mix of straightforward and moderately challenging examples.
- Reference prerequisite knowledge without re-teaching basics.
- Challenge the student with thought-provoking questions.
- Use structured explanations with clear transitions between ideas.`,

    advanced: `DIFFICULTY LEVEL: ADVANCED
- Use precise technical and academic language confidently.
- Dive deep into theory, proofs, derivations, and edge cases.
- Focus on nuance, exceptions, and connections to broader concepts.
- Provide challenging examples that require multi-step reasoning.
- Include historical context and current research where relevant.
- Push the student beyond standard curriculum where appropriate.
- Encourage critical thinking and independent analysis.`,
  };
  
  return instructions[level] || instructions.intermediate;
}

/**
 * Generate the learning style instruction string.
 */
function getStyleInstruction(
  dominant: ContentModality | 'balanced',
  secondary: ContentModality | null,
  scores: Record<ContentModality, number>,
  confidence: number,
): string {
  if (confidence < 30) {
    return `LEARNING STYLE: Not yet determined (confidence: ${confidence}%)
Present content using MULTIPLE formats equally:
- Visual: diagrams, charts, tables, color-coded content
- Logical: step-by-step reasoning, cause-and-effect
- Verbal: rich narrative explanations with analogies
- Kinesthetic: hands-on examples, practice problems
- Conceptual: big-picture connections, mind maps`;
  }

  const styleDetails: Record<string, string> = {
    visual: `VISUAL learner (${scores.visual}%): Lead with diagrams, flowcharts, tables, color-coded content, spatial layouts, and structured hierarchies. Use ASCII art for structures. Create visual mnemonics.`,
    logical: `LOGICAL learner (${scores.logical}%): Lead with step-by-step reasoning, numbered sequences, cause-and-effect chains, "if→then" logic, mathematical proofs, and systematic breakdowns.`,
    verbal: `VERBAL learner (${scores.verbal}%): Lead with rich narrative explanations, detailed descriptions, analogies, stories, real-world metaphors, and conversational tone. Define every term carefully.`,
    kinesthetic: `KINESTHETIC learner (${scores.kinesthetic}%): Lead with hands-on examples, practice problems immediately after each concept, experiments, "try this" activities, and real-world applications.`,
    conceptual: `CONCEPTUAL learner (${scores.conceptual}%): Lead with the big picture first — how this fits into the larger framework. Use mind-map style connections, underlying principles, and cross-topic relationships.`,
  };

  let prompt = `LEARNING STYLE (${confidence}% confidence): ${scores.visual}%V / ${scores.logical}%L / ${scores.verbal}%Vb / ${scores.kinesthetic}%K / ${scores.conceptual}%C\n`;
  
  if (dominant === 'balanced') {
    prompt += 'Style is BALANCED — use a mix of all modalities equally.';
  } else {
    prompt += `PRIMARY: ${styleDetails[dominant] || ''}`;
    if (secondary && secondary !== dominant) {
      prompt += `\nSECONDARY: Also incorporate ${styleDetails[secondary]?.split(':')[1]?.trim() || 'this style as support.'}`;
    }
  }

  return prompt;
}

/**
 * Generate subject-specific performance context.
 */
function getSubjectContext(
  subject: string | undefined,
  profile: StudentIntelligenceProfile,
): string {
  if (!subject) return '';
  
  const subjectLower = subject.toLowerCase();
  const perf = profile.subjectPerformances.find(p => 
    p.subject === subjectLower || 
    subjectLower.includes(p.subject) || 
    p.subject.includes(subjectLower)
  );
  
  if (!perf || perf.totalQuestions < 3) {
    return `\nSUBJECT DATA: Limited data for "${subject}". Treat as a fresh topic and assess understanding as you go.`;
  }

  let ctx = `\nSUBJECT PERFORMANCE for "${subject}":
- Accuracy: ${perf.recentAccuracy}% (recent) / ${perf.accuracy}% (overall) across ${perf.totalQuestions} questions
- Level: ${perf.difficultyLevel} | Trend: ${perf.trend}`;

  if (perf.strongTopics.length > 0) {
    ctx += `\n- Strong areas: ${perf.strongTopics.slice(0, 3).join(', ')}`;
  }
  if (perf.weakTopics.length > 0) {
    ctx += `\n- Needs work: ${perf.weakTopics.slice(0, 3).join(', ')} (focus extra attention here)`;
  }

  // Knowledge gaps for this subject
  const subjectGaps = profile.activeGaps.filter(g => 
    g.subject.toLowerCase() === subjectLower ||
    subjectLower.includes(g.subject.toLowerCase())
  );
  if (subjectGaps.length > 0) {
    ctx += `\n- Known knowledge gaps:`;
    for (const gap of subjectGaps.slice(0, 3)) {
      ctx += `\n  • [${gap.severity.toUpperCase()}] ${gap.topic}: ${gap.description}`;
    }
  }

  return ctx;
}

/**
 * Generate knowledge gap context.
 */
function getGapContext(profile: StudentIntelligenceProfile): string {
  if (profile.activeGaps.length === 0) return '';
  
  let ctx = '\nKNOWN KNOWLEDGE GAPS (address these when relevant):';
  for (const gap of profile.activeGaps.slice(0, 5)) {
    ctx += `\n- [${gap.severity.toUpperCase()}] ${gap.subject} → ${gap.topic}: ${gap.description}`;
  }
  return ctx;
}

/**
 * Generate memory context.
 */
function getMemoryContext(profile: StudentIntelligenceProfile): string {
  if (profile.relevantMemories.length === 0) return '';
  
  return `\nSTUDENT MEMORIES (things you know about this student):
${profile.relevantMemories.map(m => `- ${m}`).join('\n')}`;
}

/**
 * Generate feature-specific instructions.
 */
function getFeatureInstructions(feature: FeatureType): string {
  const instructions: Record<FeatureType, string> = {
    notes: `ADAPTIVE NOTES GENERATION:
- Adjust vocabulary complexity and explanation depth to match the student's level.
- For BEGINNER: more definitions, simpler language, more visual aids, more examples.
- For ADVANCED: deeper theory, proofs, edge cases, connections to other fields.
- If the student has knowledge gaps in this subject, address them directly in the notes.
- If the student has strong areas, build on them with advanced extensions.
- Format content according to their learning style preference.`,

    sat_prep: `ADAPTIVE SAT PREPARATION:
- Calibrate question difficulty to the student's current level.
- For WEAK areas: provide more explanations and scaffolded examples.
- For STRONG areas: present challenging edge cases and time-pressure strategies.
- Adapt strategy explanations to their learning style.
- Reference any known knowledge gaps that might affect SAT performance.
- Focus on test-taking strategies that match their cognitive style.`,

    flashcards: `ADAPTIVE FLASHCARD GENERATION:
- For BEGINNER: simpler terms, more context clues on the front, detailed backs.
- For ADVANCED: nuanced distinctions, edge cases, multi-concept connections.
- If the student has weak topics, create MORE flashcards targeting those areas.
- If they have strong topics, create FEWER flashcards there but with harder questions.
- Adjust language complexity to their level.
- Include visual/logical/verbal cues matching their learning style.`,

    file_analysis: `ADAPTIVE FILE ANALYSIS:
- Adjust the depth and complexity of the analysis to the student's level.
- Highlight sections that relate to their known knowledge gaps.
- Present explanations in their preferred learning style.
- For BEGINNER: extensive definitions, simple summaries, basic examples.
- For ADVANCED: critical analysis, connections to broader concepts, challenging questions.`,

    study_plan: `ADAPTIVE STUDY PLAN:
- Factor in the student's strengths and weaknesses when scheduling.
- Allocate MORE time to subjects/topics where they struggle.
- Allocate LESS time to subjects where they're already strong.
- Reference known knowledge gaps and include targeted remediation.
- Consider their learning style when suggesting study methods.
- If they haven't practiced certain subjects recently, prioritize those.
- Use spaced repetition data to schedule review sessions optimally.`,

    practice_quiz: `ADAPTIVE PRACTICE QUIZ:
- Questions should match the student's current difficulty level.
- Include MORE questions on weak topics and knowledge gaps.
- For topics they answered WRONG previously, rephrase similar questions differently.
- For topics they answered RIGHT, introduce slight variations or harder versions.
- Track patterns in wrong answers to identify systematic misunderstandings.
- Consider the student's cognitive load — if fatigued, reduce complexity.`,

    lecture: `ADAPTIVE LECTURE GENERATION:
- Match explanation depth and vocabulary to the student's level.
- Structure the lecture around their learning style preference.
- Address known knowledge gaps naturally within the content.
- For VISUAL learners: more diagrams, charts, spatial layouts.
- For LOGICAL learners: more derivations, step-by-step proofs.
- For KINESTHETIC learners: more practice problems and applications.
- Pace content according to their learning velocity.`,

    chat: `ADAPTIVE CHAT:
- Respond at the student's demonstrated comprehension level.
- If they're struggling (low accuracy), be more patient and thorough.
- If they're advanced, be more concise and challenging.
- Track what they ask about and adapt future responses accordingly.
- Detect emotional signals in their messages and adapt tone.`,

    exam: `ADAPTIVE EXAM:
- Calibrate question difficulty based on the student's performance data.
- Include questions that test known knowledge gaps.
- Progressively increase difficulty within the exam.
- Consider the student's mistake patterns when crafting distractors.`,

    podcast: `ADAPTIVE PODCAST ANALYSIS:
- Adjust explanation depth to the student's level.
- Present content in their preferred learning style.
- Highlight connections to topics they're currently studying.`,

    mind_map: `ADAPTIVE MIND MAP:
- Adjust complexity based on the student's level.
- Emphasize connections that address knowledge gaps.
- Use visual structures that match their learning style.
- Show prerequisite relationships from the concept graph.`,
  };

  return instructions[feature] || '';
}

// ============================================================================
//  SUBSYSTEM CONTEXT INJECTION — Pull prompts from each subsystem
// ============================================================================

/**
 * Generate the subsystem-specific context sections.
 * These are appended to the main context for maximum intelligence.
 */
function getSubsystemContextSections(
  profile: StudentIntelligenceProfile,
  subject?: string,
): string[] {
  const sections: string[] = [];

  // Cognitive State
  if (profile.cognitiveState) {
    try {
      const cogPrompt = getCognitiveContextPrompt(profile.cognitiveState);
      if (cogPrompt) sections.push(cogPrompt);
    } catch { /* skip */ }
  }

  // Emotional Profile
  if (profile.emotionalProfile) {
    try {
      const emoPrompt = getEmotionalContextPrompt(profile.emotionalProfile);
      if (emoPrompt) sections.push(emoPrompt);
    } catch { /* skip */ }
  }

  // Mistake Patterns
  if (profile.mistakeAnalysis && profile.mistakeAnalysis.totalMistakes > 0) {
    try {
      const mistakePrompt = getMistakePatternContextPrompt(subject);
      if (mistakePrompt) sections.push(mistakePrompt);
    } catch { /* skip */ }
  }

  // Spaced Repetition (due reviews)
  try {
    const srPrompt = getSpacedRepetitionContextPrompt(subject);
    if (srPrompt) sections.push(srPrompt);
  } catch { /* skip */ }

  // Predictive Engine
  if (profile.learningVelocity || profile.performanceForecasts.length > 0) {
    try {
      // Build a minimal answer-history-like array for the prompt generator
      const answerData = profile.subjectPerformances.flatMap(p => {
        const entries: Array<{ subject: string; is_correct: boolean; created_at: string }> = [];
        for (let i = 0; i < Math.min(p.totalQuestions, 20); i++) {
          entries.push({
            subject: p.subject,
            is_correct: i < p.correctAnswers,
            created_at: p.lastPracticed || new Date().toISOString(),
          });
        }
        return entries;
      });
      if (answerData.length >= 10) {
        const predPrompt = getPredictiveContextPrompt(answerData, subject);
        if (predPrompt) sections.push(predPrompt);
      }
    } catch { /* skip */ }
  }

  // Concept Graph
  if (profile.conceptGraphAnalysis) {
    try {
      const graphPrompt = getConceptGraphContextPrompt(profile.conceptGraphAnalysis, subject);
      if (graphPrompt) sections.push(graphPrompt);
    } catch { /* skip */ }
  }

  // Teaching Rules
  if (profile.teachingRules.length > 0) {
    try {
      const rulesPrompt = getRulesContextPrompt(profile.teachingRules);
      if (rulesPrompt) sections.push(rulesPrompt);
    } catch { /* skip */ }
  }

  // Socratic Questions
  if (profile.socraticQuestions.length > 0) {
    const sqPrompt = `\nSOCRATIC QUESTIONS TO ASK (when appropriate):
${profile.socraticQuestions.slice(0, 3).map(q => `- [${q.targetConcept || 'general'}] ${q.question}`).join('\n')}
Use these to probe understanding — don't just give answers, make the student think.`;
    sections.push(sqPrompt);
  }

  // Session Plan
  if (profile.sessionPlan) {
    const sp = profile.sessionPlan;
    let planPrompt = `\nOPTIMAL SESSION PLAN:
- Recommended duration: ${sp.recommendedDuration} minutes
- Topics priority: ${sp.topicPriority?.join(', ') || 'balanced'}`;
    if (sp.breakSchedule) {
      planPrompt += `\n- Break schedule: ${sp.breakSchedule}`;
    }
    if (sp.phases.length > 0) {
      planPrompt += `\n- Phases: ${sp.phases.map(p => `${p.name} (${p.durationMinutes}min)`).join(' → ')}`;
    }
    sections.push(planPrompt);
  }

  // === NEW: Teaching Strategy Intelligence ===
  try {
    const strategyPrompt = getTeachingStrategyContextPrompt(subject);
    if (strategyPrompt) sections.push(strategyPrompt);
  } catch { /* skip */ }

  // === NEW: Cross-Domain Transfer ===
  try {
    const subjectAccuracies: Record<string, number> = {};
    for (const perf of profile.subjectPerformances) {
      subjectAccuracies[perf.subject] = perf.recentAccuracy;
    }
    if (subject && Object.keys(subjectAccuracies).length >= 2) {
      const crossDomainPrompt = getCrossDomainContextPrompt({
        targetSubject: subject,
        subjectAccuracies,
      });
      if (crossDomainPrompt) sections.push(crossDomainPrompt);
    }
  } catch { /* skip */ }

  // === NEW: Learning Outcome Feedback ===
  try {
    const outcomePrompt = getLearningOutcomeContextPrompt(subject);
    if (outcomePrompt) sections.push(outcomePrompt);
  } catch { /* skip */ }

  return sections;
}

// ============================================================================
//  MAIN PUBLIC API — Generate complete adaptive context for any feature
// ============================================================================

/**
 * Generate a complete adaptive context string for an AI feature.
 * This is the PRIMARY function that all AI features should call.
 * 
 * It orchestrates ALL 7 subsystems:
 *  1. Cognitive Model → fatigue, load, ZPD
 *  2. Spaced Repetition → due reviews, retention curves
 *  3. Mistake Analyzer → error patterns, remediation
 *  4. Predictive Engine → forecasts, velocity, growth
 *  5. Emotional State → tone, encouragement
 *  6. Concept Graph → prerequisites, curriculum position
 *  7. Rule Generator → teaching rules, Socratic questions, session plan
 */
export async function generateAdaptiveContext(
  userId: string,
  feature: FeatureType,
  subject?: string,
): Promise<{
  adaptiveLevel: string;
  learningStyle: string;
  fullContext: string;
  profile: StudentIntelligenceProfile;
}> {
  const profile = await buildIntelligenceProfile(userId);

  const sections: string[] = [];

  // 1. Difficulty level
  const subjectPerf = subject 
    ? profile.subjectPerformances.find(p => p.subject === subject.toLowerCase())
    : null;
  const effectiveLevel = subjectPerf?.difficultyLevel || profile.overallLevel;
  sections.push(getDifficultyInstruction(effectiveLevel));

  // 2. Learning style
  sections.push(getStyleInstruction(
    profile.dominantStyle,
    profile.secondaryStyle,
    profile.styleScores,
    profile.styleConfidence,
  ));

  // 3. Subject-specific performance
  sections.push(getSubjectContext(subject, profile));

  // 4. Knowledge gaps
  sections.push(getGapContext(profile));

  // 5. Student memories
  sections.push(getMemoryContext(profile));

  // 6. Feature-specific instructions
  sections.push(getFeatureInstructions(feature));

  // 7. Recently studied topics
  if (profile.preferredStudyTopics.length > 0) {
    sections.push(`\nRECENT STUDY TOPICS: ${profile.preferredStudyTopics.join(', ')}`);
  }

  // 8. Overall profile summary
  sections.push(`\nPROFILE SUMMARY: ${profile.totalInteractions} total interactions | ${profile.profileCompleteness}% profile completeness | Overall accuracy: ${profile.overallAccuracy}%`);

  // 9. === SUBSYSTEM CONTEXT INJECTION ===
  const subsystemSections = getSubsystemContextSections(profile, subject);
  sections.push(...subsystemSections);

  // 10. Adaptive behavior rules (always last)
  sections.push(`\nADAPTIVE BEHAVIOR RULES:
- If the student EXPLICITLY requests a different format or level, honor it immediately.
- After explaining, verify understanding and offer alternative formats.
- If the student seems confused, switch to a SIMPLER modality.
- If the student breezes through content, increase challenge level.
- NEVER mention the adaptive system itself — it should be invisible.
- Balance personalization with well-rounded education.
- When the student shows signs of fatigue, simplify or suggest a break.
- Use Socratic questioning to develop deeper understanding.
- Track emotional cues in their messages and adapt your tone accordingly.`);

  const fullContext = sections.filter(s => s.trim()).join('\n\n');

  return {
    adaptiveLevel: effectiveLevel,
    learningStyle: fullContext,
    fullContext,
    profile,
  };
}

/**
 * A lightweight version that returns just the level and style strings
 * (for components that use the simple streamChat pattern).
 */
export async function getSimpleAdaptiveParams(
  userId: string,
  feature: FeatureType,
  subject?: string,
): Promise<{
  adaptiveLevel: string;
  learningStyle: string;
}> {
  const { adaptiveLevel, learningStyle } = await generateAdaptiveContext(userId, feature, subject);
  return { adaptiveLevel, learningStyle };
}

// ============================================================================
//  RECORDING HELPERS — Convenience methods for recording student data
// ============================================================================

/**
 * Record a quiz/practice answer with full subsystem integration.
 * This wraps answer recording with mistake analysis, spaced repetition,
 * cognitive events, emotional signals, and predictive tracking.
 */
export async function recordIntelligentAnswer(params: {
  userId: string;
  subject: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  difficulty: string;
  source: string;
  responseTimeSec?: number;
}): Promise<void> {
  // 1. Insert into answer history (DB)
  await supabase.from('student_answer_history').insert({
    user_id: params.userId,
    subject: params.subject.toLowerCase(),
    question_text: params.questionText,
    student_answer: params.studentAnswer,
    correct_answer: params.correctAnswer,
    is_correct: params.isCorrect,
    difficulty: params.difficulty,
    source: params.source,
  });

  // 2. Feed into Spaced Repetition
  try {
    const quality = mapAnswerToQuality(
      params.isCorrect,
      params.responseTimeSec,
      params.difficulty,
    );
    recordConceptEncounter({
      subject: params.subject,
      topic: params.questionText.slice(0, 60),
      quality,
      source: (params.source as any) || 'quiz',
    });
  } catch { /* ignore */ }

  // 3. Feed into Mistake Analyzer (if wrong)
  if (!params.isCorrect) {
    try {
      recordMistake({
        subject: params.subject,
        topic: params.questionText.slice(0, 60),
        questionText: params.questionText,
        studentAnswer: params.studentAnswer,
        correctAnswer: params.correctAnswer,
        wasQuickAnswer: (params.responseTimeSec || 999) < 5,
        historicalAccuracyOnTopic: 50,
        isNewTopicFormat: false,
      });
    } catch { /* ignore */ }

    // 3b. Detect cross-domain error transfer
    try {
      detectErrorTransfer({
        subject: params.subject,
        errorDescription: params.questionText.slice(0, 120),
        topic: params.questionText.slice(0, 60),
      });
    } catch { /* ignore */ }
  }

  // 4. Feed into Cognitive Model
  try {
    recordCognitiveEventByType(
      params.isCorrect ? 'question_answered_correct' : 'question_answered_wrong',
    );
  } catch { /* ignore */ }

  // 5. Feed into Emotional State Engine
  try {
    recordEmotionalSignal(
      params.isCorrect ? 'correct_answer' : 'wrong_answer',
      params.isCorrect ? 0.6 : 0.8,
    );
  } catch { /* ignore */ }

  // 6. Feed into Predictive Engine
  try {
    recordPerformanceSession({
      subject: params.subject,
      accuracy: params.isCorrect ? 100 : 0,
      questionsAnswered: 1,
      sessionDurationMinutes: 1,
    });
  } catch { /* ignore */ }

  // 7b. Feed into Teaching Strategy Outcome Tracker
  try {
    recordStrategyOutcome({
      topic: params.questionText.slice(0, 60),
      subject: params.subject,
      isCorrect: params.isCorrect,
    });
  } catch { /* ignore */ }

  // 7c. Feed into Learning Outcome Loop
  try {
    recordLearningOutcome({
      topic: params.questionText.slice(0, 60),
      subject: params.subject,
      isCorrect: params.isCorrect,
    });
  } catch { /* ignore */ }

  // 7. Create/update knowledge gap (if wrong)
  if (!params.isCorrect) {
    const topicKeywords = params.questionText.slice(0, 80).replace(/[?!.]/g, '').trim();
    
    const { data: existingGaps } = await supabase
      .from('knowledge_gaps')
      .select('id, topic')
      .eq('user_id', params.userId)
      .eq('subject', params.subject.toLowerCase())
      .eq('resolved', false)
      .limit(10);
    
    const alreadyTracked = existingGaps?.some(g => {
      const gapWords = new Set(g.topic.toLowerCase().split(/\s+/));
      const questionWords = topicKeywords.toLowerCase().split(/\s+/);
      const overlap = questionWords.filter(w => gapWords.has(w)).length;
      return overlap >= Math.min(2, gapWords.size);
    });

    if (!alreadyTracked && topicKeywords.length > 5) {
      await supabase.from('knowledge_gaps').insert({
        user_id: params.userId,
        subject: params.subject.toLowerCase(),
        topic: topicKeywords.slice(0, 100),
        gap_description: `Student answered incorrectly: "${params.questionText.slice(0, 150)}"`,
        severity: 'moderate',
        detected_from: params.source,
      });
    }
  }
}

/**
 * Record a chat message for emotional analysis and behavioral tracking.
 * Call this when the student sends a message in any chat context.
 */
export function recordChatMessage(messageText: string): void {
  // Detect emotion from the message text
  try {
    const emotion = detectEmotionFromText(messageText);
    if (emotion) {
      recordEmotionalSignal(emotion, 0.5);
    }
  } catch { /* ignore */ }

  // Record cognitive event (interaction)
  try {
    recordCognitiveEventByType('session_resume');
  } catch { /* ignore */ }
}

/**
 * Record that a student is studying a particular topic.
 */
export function recordStudyActivity(params: {
  subject: string;
  topic: string;
  feature: FeatureType;
  durationEstimate?: number;
}): void {
  const key = 'lumina_study_activity';
  try {
    const raw = localStorage.getItem(key);
    const activities: Array<{
      subject: string;
      topic: string;
      feature: string;
      timestamp: number;
    }> = raw ? JSON.parse(raw) : [];
    
    activities.push({
      subject: params.subject,
      topic: params.topic,
      feature: params.feature,
      timestamp: Date.now(),
    });

    if (activities.length > 100) {
      activities.splice(0, activities.length - 100);
    }

    localStorage.setItem(key, JSON.stringify(activities));
  } catch { /* ignore */ }

  // Also feed into cognitive model
  try {
    recordCognitiveEventByType('session_resume');
  } catch { /* ignore */ }
}

/**
 * Get items due for review from the spaced repetition engine.
 * Useful for flashcard and review session features.
 */
export function getDueReviewItems(subject?: string) {
  return getDueItems(subject);
}
