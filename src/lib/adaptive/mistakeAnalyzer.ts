/**
 * mistakeAnalyzer.ts — Error Pattern Classification & Remediation Engine
 * ======================================================================
 * 
 * Analyzes student errors to classify them into types and detect
 * systematic patterns. This enables targeted remediation rather than
 * generic "try again" responses.
 * 
 * Error Types:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  CARELESS (knew it but slipped)                                  │
 * │  → Fast answer, high historical accuracy, simple mistake         │
 * │  → Remedy: Slow down, double-check                               │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  CONCEPTUAL (fundamental misunderstanding)                       │
 * │  → Consistent errors on same concept, wrong reasoning            │
 * │  → Remedy: Re-teach from foundation, different angle             │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  PROCEDURAL (knows concept, wrong execution)                     │
 * │  → Right approach but wrong steps, calculation errors            │
 * │  → Remedy: Practice procedures, worked examples                  │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  TRANSFER (can't apply to new contexts)                          │
 * │  → Gets it in familiar format but fails in novel situations      │
 * │  → Remedy: Varied practice, real-world applications              │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  VOCABULARY (doesn't understand the question)                    │
 * │  → Misinterprets question, wrong answer category entirely        │
 * │  → Remedy: Define terms, pre-teach vocabulary                    │
 * └──────────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export type MistakeType = 'careless' | 'conceptual' | 'procedural' | 'transfer' | 'vocabulary' | 'unknown';

export interface MistakeRecord {
  timestamp: number;
  subject: string;
  topic: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  mistakeType: MistakeType;
  confidence: number;       // How confident we are in the classification (0-100)
  wasRepeated: boolean;      // Same mistake pattern seen before?
  relatedMistakes: number;   // How many similar mistakes exist
}

export interface MistakePattern {
  type: MistakeType;
  subject: string;
  frequency: number;
  percentage: number;
  topics: string[];
  trend: 'improving' | 'stable' | 'worsening';
  remediationStrategy: string;
}

export interface MistakeAnalysis {
  totalMistakes: number;
  patterns: MistakePattern[];
  dominantMistakeType: MistakeType;
  subjectBreakdown: Record<string, {
    total: number;
    careless: number;
    conceptual: number;
    procedural: number;
    transfer: number;
    vocabulary: number;
  }>;
  recommendations: string[];
  remediationPriority: Array<{
    subject: string;
    topic: string;
    type: MistakeType;
    urgency: 'critical' | 'high' | 'medium' | 'low';
    strategy: string;
  }>;
}

const MISTAKE_STORAGE_KEY = 'lumina_mistake_patterns';

// ============================================================================
//  MISTAKE CLASSIFICATION ENGINE
// ============================================================================

/**
 * Classify a mistake based on available signals.
 * Uses heuristic analysis of the answer pattern.
 */
export function classifyMistake(params: {
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  subject: string;
  wasQuickAnswer: boolean;        // answered in < 10 seconds
  historicalAccuracyOnTopic: number; // 0-100
  isNewTopicFormat: boolean;       // question in an unfamiliar format
  previousMistakes: MistakeRecord[];
}): { type: MistakeType; confidence: number } {
  const {
    questionText, studentAnswer, correctAnswer,
    wasQuickAnswer, historicalAccuracyOnTopic,
    isNewTopicFormat, previousMistakes
  } = params;

  const scores: Record<MistakeType, number> = {
    careless: 0,
    conceptual: 0,
    procedural: 0,
    transfer: 0,
    vocabulary: 0,
    unknown: 5,
  };

  const qLower = questionText.toLowerCase();
  const sLower = studentAnswer.toLowerCase().trim();
  const cLower = correctAnswer.toLowerCase().trim();

  // ---- CARELESS indicators ----
  // Quick answer + high historical accuracy = likely careless
  if (wasQuickAnswer && historicalAccuracyOnTopic > 70) scores.careless += 30;
  // Answer is close to correct (off by one, transposed digits, etc.)
  if (isCloseAnswer(sLower, cLower)) scores.careless += 25;
  // Student has gotten this exact type right before
  if (historicalAccuracyOnTopic > 80) scores.careless += 15;

  // ---- CONCEPTUAL indicators ----
  // Repeated mistakes on same topic
  const similarPrevious = previousMistakes.filter(m => 
    m.subject === params.subject && 
    hasWordOverlap(m.topic, extractTopicFromQuestion(qLower))
  );
  if (similarPrevious.length >= 2) scores.conceptual += 30;
  if (similarPrevious.length >= 4) scores.conceptual += 20;
  // Low historical accuracy on this topic
  if (historicalAccuracyOnTopic < 40) scores.conceptual += 25;
  // Answer in completely wrong category
  if (!hasAnyCommonality(sLower, cLower)) scores.conceptual += 15;

  // ---- PROCEDURAL indicators ----
  // Math/science: correct approach but wrong final answer
  if (isMathQuestion(qLower) && isPartiallyCorrectMath(sLower, cLower)) scores.procedural += 35;
  // Step-based questions where some steps are right
  if (qLower.includes('step') || qLower.includes('calculat') || qLower.includes('solve')) {
    if (hasPartialOverlap(sLower, cLower)) scores.procedural += 20;
  }
  // Moderate historical accuracy (knows concept, struggles with execution)
  if (historicalAccuracyOnTopic >= 40 && historicalAccuracyOnTopic <= 70) scores.procedural += 10;

  // ---- TRANSFER indicators ----
  // New format of question for a known topic
  if (isNewTopicFormat && historicalAccuracyOnTopic > 60) scores.transfer += 35;
  // Good accuracy in standard format, bad in novel format
  if (isNewTopicFormat) scores.transfer += 15;

  // ---- VOCABULARY indicators ----
  // Answer doesn't relate to the question at all (misread/misunderstood)
  if (!hasAnyRelevance(qLower, sLower)) scores.vocabulary += 30;
  // Question contains complex terminology
  if (hasComplexVocabulary(qLower)) scores.vocabulary += 15;
  // Answer is in completely different domain
  if (isDifferentDomain(sLower, cLower)) scores.vocabulary += 20;

  // Find the highest scoring type
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topType = sorted[0][0] as MistakeType;
  const topScore = sorted[0][1];
  const secondScore = sorted[1][1];

  // Confidence is based on margin between top two
  const confidence = Math.min(95, Math.round(topScore + (topScore - secondScore) * 0.5));

  return { type: topType, confidence: Math.max(20, confidence) };
}

// ============================================================================
//  PATTERN DETECTION
// ============================================================================

/**
 * Analyze all recorded mistakes to identify patterns.
 */
export function analyzeMistakePatterns(subject?: string): MistakeAnalysis {
  const records = getStoredMistakes();
  let filtered = subject 
    ? records.filter(m => m.subject.toLowerCase() === subject.toLowerCase())
    : records;

  if (filtered.length === 0) {
    return {
      totalMistakes: 0,
      patterns: [],
      dominantMistakeType: 'unknown',
      subjectBreakdown: {},
      recommendations: [],
      remediationPriority: [],
    };
  }

  // Count by type
  const typeCounts: Record<MistakeType, { count: number; topics: Set<string> }> = {
    careless: { count: 0, topics: new Set() },
    conceptual: { count: 0, topics: new Set() },
    procedural: { count: 0, topics: new Set() },
    transfer: { count: 0, topics: new Set() },
    vocabulary: { count: 0, topics: new Set() },
    unknown: { count: 0, topics: new Set() },
  };

  const subjectBreakdown: MistakeAnalysis['subjectBreakdown'] = {};

  for (const m of filtered) {
    typeCounts[m.mistakeType].count++;
    typeCounts[m.mistakeType].topics.add(m.topic);

    if (!subjectBreakdown[m.subject]) {
      subjectBreakdown[m.subject] = { total: 0, careless: 0, conceptual: 0, procedural: 0, transfer: 0, vocabulary: 0 };
    }
    subjectBreakdown[m.subject].total++;
    subjectBreakdown[m.subject][m.mistakeType === 'unknown' ? 'careless' : m.mistakeType]++;
  }

  // Build patterns
  const patterns: MistakePattern[] = [];
  const total = filtered.length;

  for (const [type, data] of Object.entries(typeCounts)) {
    if (data.count === 0) continue;
    
    // Determine trend (compare first half vs second half)
    const midpoint = Math.floor(filtered.length / 2);
    const firstHalf = filtered.slice(0, midpoint).filter(m => m.mistakeType === type).length;
    const secondHalf = filtered.slice(midpoint).filter(m => m.mistakeType === type).length;
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (secondHalf > firstHalf * 1.3) trend = 'worsening';
    else if (secondHalf < firstHalf * 0.7) trend = 'improving';

    const remediationStrategies: Record<MistakeType, string> = {
      careless: 'Encourage slower, more deliberate responses. Add "double-check" prompts. Highlight common careless error patterns.',
      conceptual: 'Re-teach the fundamental concept from a completely different angle. Use multiple representations (visual, verbal, concrete). Check prerequisite knowledge.',
      procedural: 'Provide step-by-step worked examples. Practice the specific procedure repeatedly. Use scaffolded problems that gradually remove support.',
      transfer: 'Present the same concept in varied contexts. Use real-world applications. Ask the student to generate their own examples.',
      vocabulary: 'Pre-teach key terms before the lesson. Create a glossary. Use simpler synonyms alongside technical terms.',
      unknown: 'Gather more data to identify the error pattern.',
    };

    patterns.push({
      type: type as MistakeType,
      subject: subject || 'all',
      frequency: data.count,
      percentage: Math.round((data.count / total) * 100),
      topics: Array.from(data.topics).slice(0, 5),
      trend,
      remediationStrategy: remediationStrategies[type as MistakeType],
    });
  }

  patterns.sort((a, b) => b.frequency - a.frequency);
  const dominantType = patterns[0]?.type || 'unknown';

  // Generate recommendations
  const recommendations: string[] = [];
  if (typeCounts.careless.count / total > 0.4) {
    recommendations.push('High careless error rate. Implement "pause and verify" checkpoints.');
  }
  if (typeCounts.conceptual.count / total > 0.3) {
    recommendations.push('Significant conceptual gaps detected. Prioritize re-teaching foundational concepts.');
  }
  if (typeCounts.procedural.count / total > 0.3) {
    recommendations.push('Procedural weakness. Increase worked examples and step-by-step practice.');
  }
  if (typeCounts.transfer.count / total > 0.2) {
    recommendations.push('Transfer difficulty. Present concepts in varied, real-world contexts.');
  }

  // Build remediation priority
  const topicMistakes = new Map<string, { count: number; types: MistakeType[]; subject: string }>();
  for (const m of filtered) {
    const key = `${m.subject}:${m.topic}`;
    if (!topicMistakes.has(key)) {
      topicMistakes.set(key, { count: 0, types: [], subject: m.subject });
    }
    const entry = topicMistakes.get(key)!;
    entry.count++;
    entry.types.push(m.mistakeType);
  }

  const remediationPriority = Array.from(topicMistakes.entries())
    .map(([key, data]) => {
      const [subj, topic] = key.split(':');
      const dominantType = getMostFrequent(data.types) as MistakeType;
      const urgency = data.count >= 5 ? 'critical' as const
        : data.count >= 3 ? 'high' as const
        : data.count >= 2 ? 'medium' as const
        : 'low' as const;

      const strategies: Record<MistakeType, string> = {
        careless: `Practice "${topic}" with a timer and self-check step`,
        conceptual: `Re-learn "${topic}" from scratch using a different teaching approach`,
        procedural: `Do 5 guided practice problems on "${topic}" with step verification`,
        transfer: `Apply "${topic}" to 3 different real-world scenarios`,
        vocabulary: `Create flashcards for key terms in "${topic}"`,
        unknown: `Review "${topic}" comprehensively`,
      };

      return {
        subject: subj,
        topic,
        type: dominantType,
        urgency,
        strategy: strategies[dominantType],
      };
    })
    .sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    })
    .slice(0, 10);

  return {
    totalMistakes: total,
    patterns,
    dominantMistakeType: dominantType,
    subjectBreakdown,
    recommendations,
    remediationPriority,
  };
}

/**
 * Record a new mistake for pattern analysis.
 */
export function recordMistake(params: {
  subject: string;
  topic: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  wasQuickAnswer: boolean;
  historicalAccuracyOnTopic: number;
  isNewTopicFormat: boolean;
}): MistakeRecord {
  const existing = getStoredMistakes();

  const { type, confidence } = classifyMistake({
    ...params,
    previousMistakes: existing,
  });

  const record: MistakeRecord = {
    timestamp: Date.now(),
    subject: params.subject.toLowerCase(),
    topic: extractTopicFromQuestion(params.questionText),
    questionText: params.questionText.slice(0, 200),
    studentAnswer: params.studentAnswer.slice(0, 100),
    correctAnswer: params.correctAnswer.slice(0, 100),
    mistakeType: type,
    confidence,
    wasRepeated: existing.some(m => 
      m.subject === params.subject.toLowerCase() && 
      hasWordOverlap(m.topic, extractTopicFromQuestion(params.questionText)) &&
      m.mistakeType === type
    ),
    relatedMistakes: existing.filter(m => 
      m.subject === params.subject.toLowerCase() && 
      hasWordOverlap(m.topic, extractTopicFromQuestion(params.questionText))
    ).length,
  };

  existing.push(record);
  // Keep last 200 mistakes
  if (existing.length > 200) existing.splice(0, existing.length - 200);
  storeMistakes(existing);

  return record;
}

/**
 * Generate a mistake pattern context string for AI prompt injection.
 */
export function getMistakePatternContextPrompt(subject?: string): string {
  const analysis = analyzeMistakePatterns(subject);
  
  if (analysis.totalMistakes < 3) return ''; // Not enough data

  const sections: string[] = [];
  sections.push(`## ERROR PATTERN ANALYSIS (${analysis.totalMistakes} mistakes analyzed)`);
  
  // Dominant pattern
  const typeLabels: Record<MistakeType, string> = {
    careless: 'Careless errors (knows it but slips)',
    conceptual: 'Conceptual gaps (fundamental misunderstanding)',
    procedural: 'Procedural errors (right idea, wrong execution)',
    transfer: 'Transfer failures (can\'t apply to new contexts)',
    vocabulary: 'Vocabulary/comprehension barriers',
    unknown: 'Unclassified errors',
  };

  for (const pattern of analysis.patterns.slice(0, 3)) {
    sections.push(`- ${typeLabels[pattern.type]}: ${pattern.percentage}% (${pattern.trend})`);
  }

  // Remediation instructions
  sections.push(`\nERROR-AWARE TEACHING STRATEGY:`);
  if (analysis.dominantMistakeType === 'careless') {
    sections.push(`This student often makes CARELESS mistakes. After they answer, prompt them to "double-check" before confirming. Present key steps clearly. Celebrate accuracy over speed.`);
  } else if (analysis.dominantMistakeType === 'conceptual') {
    sections.push(`This student has CONCEPTUAL GAPS. Don't just correct — explain WHY the correct answer is right using a different approach than what was originally taught. Use analogies and multiple representations.`);
  } else if (analysis.dominantMistakeType === 'procedural') {
    sections.push(`This student struggles with PROCEDURES. Provide explicit step-by-step worked examples. Number each step. After explaining, have them practice the same steps on a different problem immediately.`);
  } else if (analysis.dominantMistakeType === 'transfer') {
    sections.push(`This student has TRANSFER difficulty. Present every concept in at least 2 different contexts. Use real-world examples extensively. Ask "How else could this apply?"`);
  }

  // Specific topic remediation
  if (analysis.remediationPriority.length > 0) {
    sections.push(`\nPRIORITY TOPICS TO REINFORCE:`);
    for (const item of analysis.remediationPriority.slice(0, 4)) {
      sections.push(`- [${item.urgency.toUpperCase()}] ${item.subject} → "${item.topic}": ${item.strategy}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
//  STORAGE HELPERS
// ============================================================================

function getStoredMistakes(): MistakeRecord[] {
  try {
    const raw = localStorage.getItem(MISTAKE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeMistakes(records: MistakeRecord[]): void {
  try {
    localStorage.setItem(MISTAKE_STORAGE_KEY, JSON.stringify(records));
  } catch { /* ignore */ }
}

// ============================================================================
//  TEXT ANALYSIS HELPERS
// ============================================================================

function extractTopicFromQuestion(question: string): string {
  return question.slice(0, 80).replace(/[?!.,\"']/g, '').trim().toLowerCase();
}

function hasWordOverlap(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsB.filter(w => wordsA.has(w)).length;
  return overlap >= Math.min(2, wordsA.size);
}

function isCloseAnswer(student: string, correct: string): boolean {
  if (student.length < 2 || correct.length < 2) return false;
  // Check for transposition, off-by-one, or very similar answers
  const distance = levenshteinDistance(student.slice(0, 20), correct.slice(0, 20));
  return distance <= 2 && distance > 0;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function hasAnyCommonality(a: string, b: string): boolean {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 3));
  return b.split(/\s+/).filter(w => w.length > 3).some(w => wordsA.has(w));
}

function hasPartialOverlap(student: string, correct: string): boolean {
  // Check if parts of the answer match (partial correctness)
  const studentParts = student.split(/[\s,;]+/).filter(Boolean);
  const correctParts = correct.split(/[\s,;]+/).filter(Boolean);
  const matching = studentParts.filter(sp => correctParts.some(cp => cp.includes(sp) || sp.includes(cp))).length;
  return matching > 0 && matching < correctParts.length;
}

function isMathQuestion(question: string): boolean {
  return /\b(solve|calculat|find|comput|equat|formula|integral|derivative|sum|product|simplif|factor)\b/.test(question) ||
         /[+\-*/=^√∫∑]/.test(question) ||
         /\d+\s*[+\-*/]\s*\d+/.test(question);
}

function isPartiallyCorrectMath(student: string, correct: string): boolean {
  // Extract numbers from both answers
  const studentNums = (student.match(/\d+\.?\d*/g) || []).map(Number);
  const correctNums = (correct.match(/\d+\.?\d*/g) || []).map(Number);
  if (studentNums.length === 0 || correctNums.length === 0) return false;
  // Check if some numbers match (right approach, wrong final answer)
  return studentNums.some(sn => correctNums.some(cn => Math.abs(sn - cn) / (cn || 1) < 0.15));
}

function hasAnyRelevance(question: string, answer: string): boolean {
  const questionWords = new Set(question.split(/\s+/).filter(w => w.length > 4));
  const answerWords = answer.split(/\s+/).filter(w => w.length > 4);
  return answerWords.some(w => questionWords.has(w));
}

function hasComplexVocabulary(text: string): boolean {
  const complexWords = /\b(differential|equilibrium|stoichiometry|photosynthesis|thermodynamics|algorithm|polynomial|hypotenuse|isomorphism|electromagnetic|mitochondria|ontological|epistemological|juxtaposition)\b/i;
  return complexWords.test(text);
}

function isDifferentDomain(student: string, correct: string): boolean {
  // Very rough domain detection
  const mathWords = /\b(number|equation|sum|product|variable|function)\b/;
  const scienceWords = /\b(cell|atom|energy|force|element|compound|species)\b/;
  const literaryWords = /\b(character|plot|theme|author|poem|novel|metaphor)\b/;
  
  const studentDomains = [mathWords.test(student), scienceWords.test(student), literaryWords.test(student)];
  const correctDomains = [mathWords.test(correct), scienceWords.test(correct), literaryWords.test(correct)];
  
  for (let i = 0; i < 3; i++) {
    if (studentDomains[i] !== correctDomains[i]) return true;
  }
  return false;
}

function getMostFrequent<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) counts.set(item, (counts.get(item) || 0) + 1);
  let maxItem = arr[0];
  let maxCount = 0;
  for (const [item, count] of counts) {
    if (count > maxCount) { maxCount = count; maxItem = item; }
  }
  return maxItem;
}
