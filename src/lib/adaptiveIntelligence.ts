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
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                    ADAPTIVE INTELLIGENCE ENGINE                  │
 * ├──────────────┬──────────────┬───────────────┬───────────────────┤
 * │  Chat Data   │  Quiz Data   │ Activity Data │  Behavioral Data  │
 * │  (messages)  │  (answers)   │  (views/time) │  (modality prefs) │
 * ├──────────────┴──────────────┴───────────────┴───────────────────┤
 * │                    PATTERN ANALYZER                              │
 * │  ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────┐  │
 * │  │Accuracy │ │ Strengths│ │ Weaknesses │ │ Learning Style   │  │
 * │  │Tracker  │ │ Detector │ │ Detector   │ │ Classifier       │  │
 * │  └─────────┘ └──────────┘ └────────────┘ └──────────────────┘  │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                    CONTEXT GENERATOR                             │
 * │  Produces personalized prompts for every AI feature              │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { supabase } from '@/integrations/supabase/client';
import { getStoredBehavior, type BehavioralDataPoint, type ContentModality } from '@/hooks/useActivityTracker';

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
  created_at: string;
}>> {
  const { data } = await supabase
    .from('student_answer_history')
    .select('subject, is_correct, difficulty, source, question_text, created_at')
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
    .select('memory_text, category, importance')
    .eq('user_id', userId)
    .order('importance', { ascending: false })
    .limit(15);
  
  if (!data || data.length === 0) return [];
  
  return data.map(m => {
    const prefix = m.category === 'preference' ? '🎯' 
      : m.category === 'struggle' ? '⚠️'
      : m.category === 'strength' ? '💪'
      : m.category === 'personality' ? '🧑'
      : '📌';
    return `${prefix} ${m.memory_text}`;
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
      // Extract topic keywords from recent user messages
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
 * Uses frequency analysis to find the most discussed topics.
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

  // Also extract bigrams (two-word phrases) for better topic detection
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      wordFreq[bigram] = (wordFreq[bigram] || 0) + 2; // bigrams get double weight
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

    // Determine trend by comparing recent vs overall
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (total >= 10) {
      const diff = recentAccuracy - accuracy;
      if (diff > 10) trend = 'improving';
      else if (diff < -10) trend = 'declining';
    }

    // Find strong and weak topics from question text
    const topicAccuracy: Record<string, { correct: number; total: number }> = {};
    for (const answer of subjectAnswers) {
      if (!answer.question_text) continue;
      // Extract a rough topic from the question (first few meaningful words)
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

  // Sort by most practiced
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

  // Normalize to sum to 100
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
//  FULL PROFILE BUILDER — Assembles the complete intelligence profile
// ============================================================================

/**
 * Build a comprehensive intelligence profile for a student.
 * This is the main entry point that aggregates all data sources.
 * 
 * @param userId - The authenticated user's ID
 * @returns A complete StudentIntelligenceProfile
 */
export async function buildIntelligenceProfile(userId: string): Promise<StudentIntelligenceProfile> {
  // Fetch all data sources in parallel for maximum efficiency
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

  // Profile completeness score
  let completeness = 0;
  if (totalQuestions > 0) completeness += 25;
  if (totalQuestions >= 20) completeness += 15;
  if (behaviorData.dataPoints.length >= 20) completeness += 20;
  if (memories.length > 0) completeness += 15;
  if (recentTopics.length > 0) completeness += 10;
  if (gaps.length >= 0) completeness += 5; // even zero gaps is data
  if (profiles.length > 0) completeness += 10;

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

  // Check for knowledge gaps in this subject
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
 * Generate feature-specific instructions for how to use adaptive data.
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
- If they haven't practiced certain subjects recently, prioritize those.`,

    practice_quiz: `ADAPTIVE PRACTICE QUIZ:
- Questions should match the student's current difficulty level.
- Include MORE questions on weak topics and knowledge gaps.
- For topics they answered WRONG previously, rephrase similar questions differently.
- For topics they answered RIGHT, introduce slight variations or harder versions.
- Track patterns in wrong answers to identify systematic misunderstandings.`,

    lecture: `ADAPTIVE LECTURE GENERATION:
- Match explanation depth and vocabulary to the student's level.
- Structure the lecture around their learning style preference.
- Address known knowledge gaps naturally within the content.
- For VISUAL learners: more diagrams, charts, spatial layouts.
- For LOGICAL learners: more derivations, step-by-step proofs.
- For KINESTHETIC learners: more practice problems and applications.`,

    chat: `ADAPTIVE CHAT:
- Respond at the student's demonstrated comprehension level.
- If they're struggling (low accuracy), be more patient and thorough.
- If they're advanced, be more concise and challenging.
- Track what they ask about and adapt future responses accordingly.`,

    exam: `ADAPTIVE EXAM:
- Calibrate question difficulty based on the student's performance data.
- Include questions that test known knowledge gaps.
- Progressively increase difficulty within the exam.`,

    podcast: `ADAPTIVE PODCAST ANALYSIS:
- Adjust explanation depth to the student's level.
- Present content in their preferred learning style.
- Highlight connections to topics they're currently studying.`,

    mind_map: `ADAPTIVE MIND MAP:
- Adjust complexity based on the student's level.
- Emphasize connections that address knowledge gaps.
- Use visual structures that match their learning style.`,
  };

  return instructions[feature] || '';
}

// ============================================================================
//  MAIN PUBLIC API — Generate complete adaptive context for any feature
// ============================================================================

/**
 * Generate a complete adaptive context string for an AI feature.
 * This is the PRIMARY function that all AI features should call.
 * 
 * @param userId - The authenticated user's ID
 * @param feature - The type of AI feature requesting context
 * @param subject - Optional subject filter for more targeted context
 * @returns A comprehensive context string to inject into AI prompts
 * 
 * @example
 * ```tsx
 * const context = await generateAdaptiveContext(user.id, 'notes', 'biology');
 * // Pass `context` as adaptiveLevel or learningStyle to streamChat()
 * ```
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

  // Build the complete context
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

  // 7. Recently studied topics (for context continuity)
  if (profile.preferredStudyTopics.length > 0) {
    sections.push(`\nRECENT STUDY TOPICS: ${profile.preferredStudyTopics.join(', ')}`);
  }

  // 8. Overall profile summary
  sections.push(`\nPROFILE SUMMARY: ${profile.totalInteractions} total interactions | ${profile.profileCompleteness}% profile completeness | Overall accuracy: ${profile.overallAccuracy}%`);

  // 9. Adaptive behavior rules
  sections.push(`\nADAPTIVE BEHAVIOR RULES:
- If the student EXPLICITLY requests a different format or level, honor it immediately.
- After explaining, verify understanding and offer alternative formats.
- If the student seems confused, switch to a SIMPLER modality.
- If the student breezes through content, increase challenge level.
- NEVER mention the adaptive system itself — it should be invisible.
- Balance personalization with well-rounded education.`);

  const fullContext = sections.filter(s => s.trim()).join('\n\n');

  return {
    adaptiveLevel: effectiveLevel,
    learningStyle: fullContext, // The full context IS the learning style + everything else
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
 * Record a quiz/practice answer and update the adaptive profile.
 * This wraps the existing recordAnswer from useAdaptiveLevel 
 * with additional intelligence tracking.
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
}): Promise<void> {
  // Insert into answer history
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

  // If the answer was wrong, also create/update a knowledge gap
  if (!params.isCorrect) {
    const topicKeywords = params.questionText.slice(0, 80).replace(/[?!.]/g, '').trim();
    
    // Check if a similar gap already exists
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
 * Record that a student is studying a particular topic.
 * This helps the system understand what topics are being actively studied.
 */
export function recordStudyActivity(params: {
  subject: string;
  topic: string;
  feature: FeatureType;
  durationEstimate?: number;
}): void {
  // Store in localStorage for quick access (behavioral tracking)
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

    // Keep last 100 activities
    if (activities.length > 100) {
      activities.splice(0, activities.length - 100);
    }

    localStorage.setItem(key, JSON.stringify(activities));
  } catch { /* ignore */ }
}
