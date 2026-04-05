/**
 * ruleGenerator.ts — Neural Rule Generator & Session Optimizer
 * =============================================================
 * 
 * Converts accumulated behavioral patterns into explicit "teaching rules"
 * that the AI follows. This simulates how an experienced human tutor
 * develops intuitions about a student over time.
 * 
 * Also includes the Socratic Question Generator — creates targeted
 * questions based on knowledge gaps, misconceptions, and learning goals.
 * 
 * Rule Categories:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  TEACHING RULES                                                  │
 * ├──────────────────┬───────────────────┬──────────────────────────┤
 * │  Pace Rules      │  Content Rules    │  Interaction Rules        │
 * │  "go slower on X"│  "needs visuals"  │  "check understanding    │
 * │  "skip basics    │  "avoid jargon"   │   every 3 concepts"      │
 * │   for subject Y" │  "use stories"    │  "praise effort"         │
 * ├──────────────────┴───────────────────┴──────────────────────────┤
 * │  SOCRATIC QUESTION ENGINE                                        │
 * │  Generates probing questions to develop deeper understanding      │
 * ├─────────────────────────────────────────────────────────────────-┤
 * │  SESSION OPTIMIZER                                                │
 * │  Recommends optimal study session structure                        │
 * └──────────────────────────────────────────────────────────────────┘
 */

import type { MistakeAnalysis } from './mistakeAnalyzer';
import type { EmotionalProfile } from './emotionalStateEngine';
import type { CognitiveState } from './cognitiveModel';
import type { LearningVelocity, GrowthTrajectory } from './predictiveEngine';
import type { RetentionSummary } from './spacedRepetition';

// ============================================================================
//  TYPES
// ============================================================================

export interface TeachingRule {
  /** Unique identifier */
  id: string;
  /** Category of rule */
  category: 'pace' | 'content' | 'interaction' | 'emotional' | 'structural';
  /** The rule expressed as an instruction */
  instruction: string;
  /** When this rule was generated */
  generatedAt: number;
  /** Confidence level (0-100) */
  confidence: number;
  /** Evidence supporting this rule */
  evidence: string;
  /** Which subject this applies to (null = all) */
  subject: string | null;
  /** Priority (1 = highest) */
  priority: number;
}

export interface SocraticQuestion {
  question: string;
  purpose: 'probe_understanding' | 'challenge_assumption' | 'connect_concepts' | 'apply_knowledge' | 'metacognitive';
  targetConcept: string;
  difficulty: 'easy' | 'medium' | 'hard';
  followUp: string; // question to ask if they answer correctly
}

export interface SessionPlan {
  /** Recommended session duration in minutes */
  recommendedDuration: number;
  /** Session structure */
  phases: Array<{
    name: string;
    durationMinutes: number;
    activity: string;
    focus: string;
  }>;
  /** Topics to cover in priority order */
  topicPriority: string[];
  /** Concepts due for spaced repetition review */
  reviewItems: string[];
  /** Break recommendations */
  breakSchedule: string;
}

// ============================================================================
//  RULE GENERATION ENGINE
// ============================================================================

/**
 * Generate teaching rules from all available data about the student.
 * This is the "brain" that converts observations into behavior directives.
 */
export function generateTeachingRules(params: {
  mistakeAnalysis: MistakeAnalysis;
  emotionalProfile: EmotionalProfile;
  cognitiveState: CognitiveState;
  learningVelocity: LearningVelocity;
  growthTrajectory: GrowthTrajectory;
  retentionSummary: RetentionSummary;
  dominantLearningStyle: string;
  overallAccuracy: number;
  activeSubjects: string[];
}): TeachingRule[] {
  const rules: TeachingRule[] = [];
  let priority = 1;

  // ---- PACE RULES ----
  
  // From learning velocity
  if (params.learningVelocity.paceLabel === 'very_slow' || params.learningVelocity.paceLabel === 'slow') {
    rules.push({
      id: `pace_slow_${Date.now()}`,
      category: 'pace',
      instruction: 'SLOW PACE: Explain each concept thoroughly before moving on. Use 2-3 examples per concept. Never assume prior understanding. Check comprehension after every major point.',
      generatedAt: Date.now(),
      confidence: 80,
      evidence: `Learning velocity is ${params.learningVelocity.paceLabel} (${params.learningVelocity.relativePace}x average)`,
      subject: null,
      priority: priority++,
    });
  } else if (params.learningVelocity.paceLabel === 'very_fast') {
    rules.push({
      id: `pace_fast_${Date.now()}`,
      category: 'pace',
      instruction: 'FAST PACE: Move quickly through basics. Focus on advanced connections, edge cases, and challenging extensions. Minimize repetition unless requested.',
      generatedAt: Date.now(),
      confidence: 80,
      evidence: `Learning velocity is ${params.learningVelocity.paceLabel} (${params.learningVelocity.relativePace}x average)`,
      subject: null,
      priority: priority++,
    });
  }

  // Subject-specific pace rules
  for (const [subject, velocity] of Object.entries(params.learningVelocity.subjectVelocities)) {
    if (velocity.currentTrajectory === 'plateauing') {
      rules.push({
        id: `pace_plateau_${subject}_${Date.now()}`,
        category: 'pace',
        instruction: `PLATEAU in ${subject}: Switch teaching approach. Try: problem-based learning, real-world applications, or connecting to student's interests. Current methods have stalled.`,
        generatedAt: Date.now(),
        confidence: 70,
        evidence: `${subject} trajectory is plateauing with pace ${velocity.pace}`,
        subject,
        priority: priority++,
      });
    }
    if (velocity.currentTrajectory === 'declining') {
      rules.push({
        id: `pace_decline_${subject}_${Date.now()}`,
        category: 'pace',
        instruction: `DECLINE in ${subject}: Urgently review fundamentals. The student is losing ground — go back to the last point of strong understanding and rebuild from there.`,
        generatedAt: Date.now(),
        confidence: 85,
        evidence: `${subject} trajectory is declining`,
        subject,
        priority: 1, // highest priority
      });
    }
  }

  // ---- CONTENT RULES ----

  // From mistake patterns
  if (params.mistakeAnalysis.dominantMistakeType === 'conceptual') {
    rules.push({
      id: `content_conceptual_${Date.now()}`,
      category: 'content',
      instruction: 'CONCEPTUAL ERRORS DOMINANT: Always explain the "why" before the "how". Use at least 2 different representations for each concept (visual + verbal, concrete + abstract). Check foundational understanding before building on it.',
      generatedAt: Date.now(),
      confidence: 85,
      evidence: `${params.mistakeAnalysis.patterns.find(p => p.type === 'conceptual')?.percentage || 0}% of errors are conceptual`,
      subject: null,
      priority: priority++,
    });
  }

  if (params.mistakeAnalysis.dominantMistakeType === 'procedural') {
    rules.push({
      id: `content_procedural_${Date.now()}`,
      category: 'content',
      instruction: 'PROCEDURAL ERRORS DOMINANT: For every procedure, provide a numbered step-by-step walkthrough. After demonstration, have the student attempt the same steps on a different problem. Verify each step independently.',
      generatedAt: Date.now(),
      confidence: 85,
      evidence: `${params.mistakeAnalysis.patterns.find(p => p.type === 'procedural')?.percentage || 0}% of errors are procedural`,
      subject: null,
      priority: priority++,
    });
  }

  if (params.mistakeAnalysis.dominantMistakeType === 'careless') {
    rules.push({
      id: `content_careless_${Date.now()}`,
      category: 'content',
      instruction: 'CARELESS ERRORS FREQUENT: Add "double-check" prompts. After the student answers, ask "Are you sure? Take a moment to verify." Highlight common traps and pitfalls before they encounter them.',
      generatedAt: Date.now(),
      confidence: 80,
      evidence: `${params.mistakeAnalysis.patterns.find(p => p.type === 'careless')?.percentage || 0}% of errors are careless`,
      subject: null,
      priority: priority++,
    });
  }

  // From learning style
  const styleRules: Record<string, string> = {
    visual: 'CONTENT FORMAT: Lead with visual representations. Use diagrams, charts, tables, flowcharts, and spatial layouts as PRIMARY explanation tools.',
    logical: 'CONTENT FORMAT: Lead with logical structure. Numbered steps, cause→effect chains, proofs, and systematic breakdowns.',
    verbal: 'CONTENT FORMAT: Lead with narrative. Rich descriptions, analogies, stories, and conversational explanations.',
    kinesthetic: 'CONTENT FORMAT: Lead with practice. Present a problem BEFORE theory. Use "try this" prompts and hands-on activities.',
    conceptual: 'CONTENT FORMAT: Lead with the big picture. Start with how this fits in the larger framework before diving into details.',
  };

  if (params.dominantLearningStyle in styleRules) {
    rules.push({
      id: `content_style_${Date.now()}`,
      category: 'content',
      instruction: styleRules[params.dominantLearningStyle],
      generatedAt: Date.now(),
      confidence: 75,
      evidence: `Dominant learning style: ${params.dominantLearningStyle}`,
      subject: null,
      priority: priority++,
    });
  }

  // ---- INTERACTION RULES ----

  // From emotional profile
  if (params.emotionalProfile.frustrationTolerance === 'low') {
    rules.push({
      id: `interaction_lowtol_${Date.now()}`,
      category: 'interaction',
      instruction: 'LOW FRUSTRATION TOLERANCE: Never present more than 2 challenging items consecutively. Insert "easy wins" between difficult content. Use encouraging language proactively, not just reactively.',
      generatedAt: Date.now(),
      confidence: 75,
      evidence: `Frustration tolerance assessed as "low" based on behavioral signals`,
      subject: null,
      priority: priority++,
    });
  }

  if (params.emotionalProfile.resilienceScore > 70) {
    rules.push({
      id: `interaction_resilient_${Date.now()}`,
      category: 'interaction',
      instruction: 'HIGH RESILIENCE: This student bounces back from setbacks. It is safe to present challenging material and allow productive struggle. Praise persistence and problem-solving approach, not just correct answers.',
      generatedAt: Date.now(),
      confidence: 70,
      evidence: `Resilience score: ${params.emotionalProfile.resilienceScore}%`,
      subject: null,
      priority: priority++,
    });
  }

  if (params.emotionalProfile.academicConfidence < 40) {
    rules.push({
      id: `interaction_lowconf_${Date.now()}`,
      category: 'interaction',
      instruction: 'LOW ACADEMIC CONFIDENCE: Start every interaction by referencing something the student has done well. Frame challenges as "stretches" not "tests". Use "we" language: "Let\'s figure this out together."',
      generatedAt: Date.now(),
      confidence: 80,
      evidence: `Academic confidence: ${params.emotionalProfile.academicConfidence}%`,
      subject: null,
      priority: priority++,
    });
  }

  // From cognitive state
  if (params.cognitiveState.workingMemoryCapacity <= 3) {
    rules.push({
      id: `interaction_lowmem_${Date.now()}`,
      category: 'structural',
      instruction: 'LIMITED WORKING MEMORY: Present ONE concept at a time. Use chunking extensively. Provide frequent recaps. No compound explanations with multiple clauses. Keep examples concrete and simple.',
      generatedAt: Date.now(),
      confidence: 70,
      evidence: `Estimated working memory capacity: ${params.cognitiveState.workingMemoryCapacity} items`,
      subject: null,
      priority: priority++,
    });
  }

  // ---- STRUCTURAL RULES ----

  // From retention data
  if (params.retentionSummary.itemsDueForReview > 5) {
    rules.push({
      id: `structural_review_${Date.now()}`,
      category: 'structural',
      instruction: `REVIEW NEEDED: ${params.retentionSummary.itemsDueForReview} concepts are due for review. When naturally relevant, reference and reinforce fading knowledge. Weave review into new content rather than making it a separate activity.`,
      generatedAt: Date.now(),
      confidence: 90,
      evidence: `${params.retentionSummary.itemsDueForReview} items overdue for spaced repetition review`,
      subject: null,
      priority: priority++,
    });
  }

  // Consistency
  if (params.growthTrajectory.consistencyScore < 30) {
    rules.push({
      id: `structural_consistency_${Date.now()}`,
      category: 'structural',
      instruction: 'LOW STUDY CONSISTENCY: The student studies irregularly. When they DO engage, make sessions count — focus on high-impact topics. End each session with a clear "next time" plan to encourage return.',
      generatedAt: Date.now(),
      confidence: 70,
      evidence: `Study consistency: ${params.growthTrajectory.consistencyScore}%`,
      subject: null,
      priority: priority++,
    });
  }

  return rules.sort((a, b) => a.priority - b.priority);
}

// ============================================================================
//  SOCRATIC QUESTION GENERATOR
// ============================================================================

/**
 * Generate Socratic questions based on the student's current knowledge state.
 */
export function generateSocraticQuestions(params: {
  subject: string;
  currentTopic: string;
  weakTopics: string[];
  strongTopics: string[];
  knowledgeGaps: Array<{ topic: string; description: string }>;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}): SocraticQuestion[] {
  const questions: SocraticQuestion[] = [];

  // Probe understanding of weak topics
  for (const weakTopic of params.weakTopics.slice(0, 2)) {
    questions.push({
      question: `Can you explain ${weakTopic} in your own words? What's the most important thing to understand about it?`,
      purpose: 'probe_understanding',
      targetConcept: weakTopic,
      difficulty: 'easy',
      followUp: `Great! Now, how does ${weakTopic} connect to ${params.currentTopic}?`,
    });
  }

  // Challenge assumptions on strong topics (push deeper)
  for (const strongTopic of params.strongTopics.slice(0, 1)) {
    questions.push({
      question: `You're strong in ${strongTopic}. But can you think of a case where the usual rules DON'T apply?`,
      purpose: 'challenge_assumption',
      targetConcept: strongTopic,
      difficulty: 'hard',
      followUp: `Excellent thinking! What does that exception tell us about the underlying principle?`,
    });
  }

  // Connect concepts
  if (params.strongTopics.length > 0 && params.weakTopics.length > 0) {
    questions.push({
      question: `How might your understanding of ${params.strongTopics[0]} help you make sense of ${params.weakTopics[0]}?`,
      purpose: 'connect_concepts',
      targetConcept: params.weakTopics[0],
      difficulty: 'medium',
      followUp: `That's a great connection! Can you think of another example where these two ideas overlap?`,
    });
  }

  // Apply knowledge
  questions.push({
    question: `If you had to explain ${params.currentTopic} to a younger student, how would you do it?`,
    purpose: 'apply_knowledge',
    targetConcept: params.currentTopic,
    difficulty: 'medium',
    followUp: `Teaching others is the best way to learn! Now, what part was hardest to simplify?`,
  });

  // Metacognitive
  questions.push({
    question: `What's the one thing about ${params.currentTopic} that you find most confusing or uncertain about?`,
    purpose: 'metacognitive',
    targetConcept: params.currentTopic,
    difficulty: 'easy',
    followUp: `Being aware of what you don't know is a superpower. Let's tackle that uncertainty together.`,
  });

  // From knowledge gaps
  for (const gap of params.knowledgeGaps.slice(0, 2)) {
    questions.push({
      question: `We noticed you might have some uncertainty about ${gap.topic}. What do you currently understand about it?`,
      purpose: 'probe_understanding',
      targetConcept: gap.topic,
      difficulty: 'easy',
      followUp: `Good start! Let me fill in the pieces you might be missing.`,
    });
  }

  return questions;
}

// ============================================================================
//  SESSION OPTIMIZER
// ============================================================================

/**
 * Generate an optimized study session plan based on all available intelligence.
 */
export function optimizeStudySession(params: {
  availableMinutes: number;
  cognitiveState: CognitiveState;
  retentionSummary: RetentionSummary;
  weakSubjects: string[];
  strongSubjects: string[];
  dueReviewItems: string[];
  emotionalProfile: EmotionalProfile;
  bestStudyTime: string;
}): SessionPlan {
  const duration = params.availableMinutes || 45;
  const phases: SessionPlan['phases'] = [];

  // Phase 1: Warm-up (10% of session)
  const warmupDuration = Math.max(3, Math.round(duration * 0.1));
  phases.push({
    name: 'Warm-up',
    durationMinutes: warmupDuration,
    activity: params.emotionalProfile.motivationLevel < 40 
      ? 'Start with something fun — a quick quiz on a topic you\'re good at'
      : 'Quick review of yesterday\'s key concepts',
    focus: params.strongSubjects[0] || 'review',
  });

  // Phase 2: Spaced repetition review (if items are due, 15% of session)
  if (params.dueReviewItems.length > 0) {
    const reviewDuration = Math.max(5, Math.round(duration * 0.15));
    phases.push({
      name: 'Memory Review',
      durationMinutes: reviewDuration,
      activity: `Review ${Math.min(params.dueReviewItems.length, 5)} fading concepts using flashcard-style recall`,
      focus: 'spaced repetition',
    });
  }

  // Phase 3: Main learning (50-60% of session)
  const mainDuration = Math.max(10, Math.round(duration * 0.55));
  const mainFocus = params.weakSubjects[0] || 'new material';
  phases.push({
    name: 'Deep Learning',
    durationMinutes: mainDuration,
    activity: params.cognitiveState.recommendation === 'reduce_complexity'
      ? `Focus on reinforcing fundamentals in ${mainFocus}`
      : `Tackle new concepts in ${mainFocus} with guided practice`,
    focus: mainFocus,
  });

  // Break (if session > 30 min)
  if (duration > 30) {
    phases.push({
      name: 'Break',
      durationMinutes: 5,
      activity: 'Take a 5-minute break — stand up, stretch, get water',
      focus: 'rest',
    });
  }

  // Phase 4: Practice/Application (20% of session)
  const practiceDuration = Math.max(5, Math.round(duration * 0.2));
  phases.push({
    name: 'Practice',
    durationMinutes: practiceDuration,
    activity: 'Apply what you learned with practice problems or flashcards',
    focus: mainFocus,
  });

  // Phase 5: Wrap-up (5% of session)
  phases.push({
    name: 'Wrap-up',
    durationMinutes: Math.max(2, Math.round(duration * 0.05)),
    activity: 'Summarize 3 key things you learned today. Set a goal for next session.',
    focus: 'reflection',
  });

  // Topic priority
  const topicPriority = [
    ...params.weakSubjects,
    ...params.dueReviewItems.slice(0, 3),
    ...params.strongSubjects.slice(0, 1), // include one strong topic for confidence
  ];

  // Break schedule
  let breakSchedule: string;
  if (duration <= 25) breakSchedule = 'No break needed for this short session.';
  else if (duration <= 45) breakSchedule = 'Take a 5-minute break at the halfway point.';
  else breakSchedule = 'Take a 5-minute break every 25 minutes (Pomodoro technique).';

  return {
    recommendedDuration: Math.min(duration, params.cognitiveState.fatigueLevel > 60 ? 30 : 60),
    phases,
    topicPriority,
    reviewItems: params.dueReviewItems.slice(0, 5),
    breakSchedule,
  };
}

/**
 * Generate a comprehensive rules context string for AI prompt injection.
 */
export function getRulesContextPrompt(rules: TeachingRule[]): string {
  if (rules.length === 0) return '';

  const sections: string[] = [];
  sections.push(`## PERSONALIZED TEACHING RULES (generated from behavioral analysis)`);
  sections.push(`These rules are derived from observed patterns. Follow them unless explicitly overridden by the student.`);

  // Group by category
  const categories: Record<string, TeachingRule[]> = {};
  for (const rule of rules) {
    if (!categories[rule.category]) categories[rule.category] = [];
    categories[rule.category].push(rule);
  }

  for (const [category, catRules] of Object.entries(categories)) {
    sections.push(`\n### ${category.toUpperCase()} Rules`);
    for (const rule of catRules.slice(0, 3)) {
      sections.push(`- [${rule.confidence}% confidence] ${rule.instruction}`);
    }
  }

  return sections.join('\n');
}
