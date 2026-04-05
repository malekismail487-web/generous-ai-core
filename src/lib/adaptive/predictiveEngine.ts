/**
 * predictiveEngine.ts — Performance Prediction & Learning Velocity Engine
 * =======================================================================
 * 
 * Predicts future student performance based on historical trends.
 * Tracks learning velocity (how fast they acquire new knowledge)
 * and estimates time-to-mastery for different subjects.
 * 
 * Models:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                PREDICTIVE PERFORMANCE ENGINE                 │
 * ├──────────────┬──────────────┬──────────────┬───────────────┤
 * │   Learning   │  Performance │   Mastery    │   Plateau     │
 * │   Velocity   │  Forecaster  │  Estimator   │  Detector     │
 * ├──────────────┴──────────────┴──────────────┴───────────────┤
 * │             CROSS-SUBJECT TRANSFER ANALYZER                  │
 * │  Detects when skills in one subject predict success in        │
 * │  another (e.g., math skills → physics performance)            │
 * ├─────────────────────────────────────────────────────────────-┤
 * │             GROWTH TRAJECTORY MODELER                         │
 * │  Models long-term academic growth patterns                     │
 * └─────────────────────────────────────────────────────────────┘
 */

// ============================================================================
//  TYPES
// ============================================================================

export interface LearningVelocity {
  /** Questions per session to reach proficiency */
  questionsToLearn: number;
  /** How fast accuracy improves per 10 questions */
  accuracyGainRate: number;
  /** Speed relative to average (0.5 = slow, 1.0 = average, 2.0 = fast) */
  relativePace: number;
  /** Classification */
  paceLabel: 'very_slow' | 'slow' | 'average' | 'fast' | 'very_fast';
  /** Subject-specific velocities */
  subjectVelocities: Record<string, {
    pace: number;
    questionsToMastery: number;
    currentTrajectory: 'accelerating' | 'steady' | 'plateauing' | 'declining';
  }>;
}

export interface PerformanceForecast {
  subject: string;
  currentAccuracy: number;
  predictedAccuracyIn7Days: number;
  predictedAccuracyIn30Days: number;
  estimatedDaysToTarget: number; // days to reach 80% accuracy
  confidence: number; // 0-100
  trajectory: 'accelerating' | 'steady' | 'plateauing' | 'declining';
  riskLevel: 'on_track' | 'at_risk' | 'falling_behind' | 'excelling';
}

export interface CrossSubjectTransfer {
  sourceSubject: string;
  targetSubject: string;
  correlationStrength: number; // 0-1
  transferType: 'positive' | 'negative' | 'neutral';
  sharedSkills: string[];
  recommendation: string;
}

export interface GrowthTrajectory {
  overallTrend: 'accelerating' | 'steady' | 'plateauing' | 'declining';
  weeklyGrowthRate: number; // percentage points per week
  bestPerformingTime: string; // e.g., "morning", "evening"
  consistencyScore: number; // 0-100, how regularly they study
  projectedMilestones: Array<{
    milestone: string;
    estimatedDate: string;
    probability: number;
  }>;
}

/** Historical data point for trend analysis */
interface PerformanceDataPoint {
  timestamp: number;
  subject: string;
  accuracy: number;
  questionsAnswered: number;
  sessionDurationMinutes: number;
}

const PREDICTION_STORAGE_KEY = 'lumina_prediction_data';

// ============================================================================
//  DATA COLLECTION
// ============================================================================

function getStoredPerformanceData(): PerformanceDataPoint[] {
  try {
    const raw = localStorage.getItem(PREDICTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storePerformanceData(data: PerformanceDataPoint[]): void {
  try {
    // Keep last 500 data points
    if (data.length > 500) data.splice(0, data.length - 500);
    localStorage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/**
 * Record a study session's performance for prediction modeling.
 */
export function recordPerformanceSession(params: {
  subject: string;
  accuracy: number;
  questionsAnswered: number;
  sessionDurationMinutes: number;
}): void {
  const data = getStoredPerformanceData();
  data.push({
    timestamp: Date.now(),
    subject: params.subject.toLowerCase(),
    accuracy: params.accuracy,
    questionsAnswered: params.questionsAnswered,
    sessionDurationMinutes: params.sessionDurationMinutes,
  });
  storePerformanceData(data);
}

// ============================================================================
//  LEARNING VELOCITY CALCULATOR
// ============================================================================

/**
 * Calculate learning velocity — how quickly the student acquires new knowledge.
 */
export function calculateLearningVelocity(
  answerHistory: Array<{ subject: string; is_correct: boolean; created_at: string }>,
): LearningVelocity {
  if (answerHistory.length < 10) {
    return {
      questionsToLearn: 20,
      accuracyGainRate: 5,
      relativePace: 1.0,
      paceLabel: 'average',
      subjectVelocities: {},
    };
  }

  // Group by subject
  const subjects: Record<string, Array<{ is_correct: boolean; created_at: string }>> = {};
  for (const answer of answerHistory) {
    const subj = answer.subject.toLowerCase();
    if (!subjects[subj]) subjects[subj] = [];
    subjects[subj].push(answer);
  }

  const subjectVelocities: LearningVelocity['subjectVelocities'] = {};
  const paces: number[] = [];

  for (const [subject, answers] of Object.entries(subjects)) {
    if (answers.length < 5) continue;

    // Sort chronologically
    const sorted = [...answers].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Calculate accuracy in sliding windows of 10
    const windowSize = Math.min(10, Math.floor(sorted.length / 2));
    const accuracyWindows: number[] = [];
    
    for (let i = 0; i <= sorted.length - windowSize; i += windowSize) {
      const window = sorted.slice(i, i + windowSize);
      const acc = window.filter(a => a.is_correct).length / window.length * 100;
      accuracyWindows.push(acc);
    }

    // Calculate accuracy gain rate (percentage points per window)
    let totalGain = 0;
    for (let i = 1; i < accuracyWindows.length; i++) {
      totalGain += accuracyWindows[i] - accuracyWindows[i - 1];
    }
    const gainRate = accuracyWindows.length > 1 
      ? totalGain / (accuracyWindows.length - 1) 
      : 0;

    // Estimate questions to reach 80% accuracy
    const currentAccuracy = accuracyWindows[accuracyWindows.length - 1] || 50;
    const questionsToMastery = gainRate > 0 
      ? Math.round(((80 - currentAccuracy) / gainRate) * windowSize)
      : 100;

    // Determine trajectory
    let trajectory: 'accelerating' | 'steady' | 'plateauing' | 'declining';
    if (accuracyWindows.length >= 3) {
      const recentGain = accuracyWindows[accuracyWindows.length - 1] - accuracyWindows[accuracyWindows.length - 2];
      const priorGain = accuracyWindows[accuracyWindows.length - 2] - accuracyWindows[accuracyWindows.length - 3];
      if (recentGain > priorGain + 3) trajectory = 'accelerating';
      else if (recentGain < -3) trajectory = 'declining';
      else if (Math.abs(recentGain) < 3 && currentAccuracy > 70) trajectory = 'plateauing';
      else trajectory = 'steady';
    } else {
      trajectory = gainRate > 0 ? 'steady' : 'declining';
    }

    const pace = gainRate > 0 ? gainRate / 5 : 0.5; // normalize around 1.0
    paces.push(pace);

    subjectVelocities[subject] = {
      pace: Math.round(pace * 100) / 100,
      questionsToMastery: Math.max(0, questionsToMastery),
      currentTrajectory: trajectory,
    };
  }

  // Overall pace
  const avgPace = paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : 1.0;
  
  let paceLabel: LearningVelocity['paceLabel'];
  if (avgPace >= 1.8) paceLabel = 'very_fast';
  else if (avgPace >= 1.3) paceLabel = 'fast';
  else if (avgPace >= 0.7) paceLabel = 'average';
  else if (avgPace >= 0.4) paceLabel = 'slow';
  else paceLabel = 'very_slow';

  // Calculate average accuracy gain per 10 questions
  const overallGainRate = Object.values(subjectVelocities)
    .map(v => v.pace)
    .reduce((a, b) => a + b, 0) / (Object.keys(subjectVelocities).length || 1) * 5;

  return {
    questionsToLearn: Math.round(80 / Math.max(1, overallGainRate)),
    accuracyGainRate: Math.round(overallGainRate * 10) / 10,
    relativePace: Math.round(avgPace * 100) / 100,
    paceLabel,
    subjectVelocities,
  };
}

// ============================================================================
//  PERFORMANCE FORECASTER
// ============================================================================

/**
 * Forecast future performance for each subject.
 */
export function forecastPerformance(
  answerHistory: Array<{ subject: string; is_correct: boolean; created_at: string }>,
): PerformanceForecast[] {
  const subjects: Record<string, Array<{ is_correct: boolean; created_at: string }>> = {};
  for (const answer of answerHistory) {
    const subj = answer.subject.toLowerCase();
    if (!subjects[subj]) subjects[subj] = [];
    subjects[subj].push(answer);
  }

  const forecasts: PerformanceForecast[] = [];

  for (const [subject, answers] of Object.entries(subjects)) {
    if (answers.length < 5) continue;

    const sorted = [...answers].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Current accuracy (last 20)
    const recent = sorted.slice(-20);
    const currentAccuracy = Math.round(
      (recent.filter(a => a.is_correct).length / recent.length) * 100
    );

    // Calculate daily accuracy trend
    const dayBuckets: Record<string, { correct: number; total: number }> = {};
    for (const a of sorted) {
      const day = new Date(a.created_at).toISOString().split('T')[0];
      if (!dayBuckets[day]) dayBuckets[day] = { correct: 0, total: 0 };
      dayBuckets[day].total++;
      if (a.is_correct) dayBuckets[day].correct++;
    }

    const dailyAccuracies = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => (data.correct / data.total) * 100);

    // Linear regression for prediction
    const { slope, intercept } = linearRegression(dailyAccuracies);
    
    // Predict future accuracy
    const daysOfData = dailyAccuracies.length;
    const predict7 = Math.max(0, Math.min(100, Math.round(intercept + slope * (daysOfData + 7))));
    const predict30 = Math.max(0, Math.min(100, Math.round(intercept + slope * (daysOfData + 30))));

    // Days to reach 80%
    const daysToTarget = slope > 0 
      ? Math.max(0, Math.round((80 - currentAccuracy) / slope))
      : -1; // -1 means not on track

    // Trajectory
    let trajectory: PerformanceForecast['trajectory'];
    if (slope > 2) trajectory = 'accelerating';
    else if (slope > 0.3) trajectory = 'steady';
    else if (slope > -0.3) trajectory = 'plateauing';
    else trajectory = 'declining';

    // Risk level
    let riskLevel: PerformanceForecast['riskLevel'];
    if (currentAccuracy >= 85 && slope >= 0) riskLevel = 'excelling';
    else if (currentAccuracy >= 55 && slope > -1) riskLevel = 'on_track';
    else if (slope < -2 || currentAccuracy < 40) riskLevel = 'falling_behind';
    else riskLevel = 'at_risk';

    // Confidence based on data quantity
    const confidence = Math.min(90, Math.round(Math.min(answers.length / 50, 1) * 90));

    forecasts.push({
      subject,
      currentAccuracy,
      predictedAccuracyIn7Days: predict7,
      predictedAccuracyIn30Days: predict30,
      estimatedDaysToTarget: daysToTarget >= 0 ? daysToTarget : 999,
      confidence,
      trajectory,
      riskLevel,
    });
  }

  return forecasts.sort((a, b) => {
    const riskOrder = { falling_behind: 0, at_risk: 1, on_track: 2, excelling: 3 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
}

// ============================================================================
//  CROSS-SUBJECT TRANSFER ANALYZER
// ============================================================================

/**
 * Analyze correlations between subject performances to detect knowledge transfer.
 */
export function analyzeCrossSubjectTransfer(
  answerHistory: Array<{ subject: string; is_correct: boolean; created_at: string }>,
): CrossSubjectTransfer[] {
  // Group by subject and calculate per-period accuracy
  const subjectAccuracies: Record<string, number[]> = {};
  const periodSize = 10; // 10-question windows

  const subjects: Record<string, Array<{ is_correct: boolean; created_at: string }>> = {};
  for (const a of answerHistory) {
    const s = a.subject.toLowerCase();
    if (!subjects[s]) subjects[s] = [];
    subjects[s].push(a);
  }

  for (const [subject, answers] of Object.entries(subjects)) {
    if (answers.length < 10) continue;
    
    subjectAccuracies[subject] = [];
    for (let i = 0; i < answers.length; i += periodSize) {
      const window = answers.slice(i, i + periodSize);
      const acc = window.filter(a => a.is_correct).length / window.length;
      subjectAccuracies[subject].push(acc);
    }
  }

  const transfers: CrossSubjectTransfer[] = [];
  const subjectNames = Object.keys(subjectAccuracies);

  // Known skill transfer pairs
  const knownTransfers: Record<string, { targets: string[]; skills: string[] }> = {
    math: { targets: ['physics', 'chemistry', 'computer science', 'economics'], skills: ['calculation', 'logical reasoning', 'pattern recognition'] },
    physics: { targets: ['math', 'engineering', 'chemistry'], skills: ['mathematical modeling', 'scientific reasoning', 'problem decomposition'] },
    chemistry: { targets: ['biology', 'physics'], skills: ['molecular thinking', 'balancing equations', 'systematic analysis'] },
    biology: { targets: ['chemistry', 'environmental science'], skills: ['classification', 'systems thinking', 'cause-effect analysis'] },
    english: { targets: ['history', 'social studies', 'arabic'], skills: ['reading comprehension', 'analytical writing', 'critical thinking'] },
    history: { targets: ['social studies', 'english', 'geography'], skills: ['cause-effect reasoning', 'timeline analysis', 'source evaluation'] },
  };

  for (let i = 0; i < subjectNames.length; i++) {
    for (let j = i + 1; j < subjectNames.length; j++) {
      const subA = subjectNames[i];
      const subB = subjectNames[j];
      
      // Calculate correlation between accuracy trends
      const accA = subjectAccuracies[subA];
      const accB = subjectAccuracies[subB];
      const minLen = Math.min(accA.length, accB.length);
      
      if (minLen < 3) continue;

      const correlation = pearsonCorrelation(accA.slice(0, minLen), accB.slice(0, minLen));
      
      if (Math.abs(correlation) < 0.3) continue; // weak correlation, skip

      const knownA = knownTransfers[subA];
      const isKnownPair = knownA?.targets.includes(subB);
      const sharedSkills = isKnownPair ? knownA!.skills : ['analytical thinking', 'study skills'];

      const transferType = correlation > 0.3 ? 'positive' : correlation < -0.3 ? 'negative' : 'neutral';

      let recommendation = '';
      if (transferType === 'positive') {
        recommendation = `Strong positive transfer between ${subA} and ${subB}. Improvement in one often predicts improvement in the other. Leverage ${subA} concepts when teaching ${subB}.`;
      } else if (transferType === 'negative') {
        recommendation = `Possible interference between ${subA} and ${subB}. Be careful not to confuse similar concepts across these subjects.`;
      }

      transfers.push({
        sourceSubject: subA,
        targetSubject: subB,
        correlationStrength: Math.round(Math.abs(correlation) * 100) / 100,
        transferType,
        sharedSkills,
        recommendation,
      });
    }
  }

  return transfers.sort((a, b) => b.correlationStrength - a.correlationStrength);
}

// ============================================================================
//  GROWTH TRAJECTORY MODELER
// ============================================================================

/**
 * Model the student's overall long-term growth trajectory.
 */
export function modelGrowthTrajectory(
  answerHistory: Array<{ subject: string; is_correct: boolean; created_at: string }>,
): GrowthTrajectory {
  if (answerHistory.length < 15) {
    return {
      overallTrend: 'steady',
      weeklyGrowthRate: 0,
      bestPerformingTime: 'unknown',
      consistencyScore: 0,
      projectedMilestones: [],
    };
  }

  // Sort chronologically
  const sorted = [...answerHistory].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Weekly accuracy buckets
  const weekBuckets: Record<string, { correct: number; total: number }> = {};
  for (const a of sorted) {
    const date = new Date(a.created_at);
    const weekStart = getWeekStart(date);
    if (!weekBuckets[weekStart]) weekBuckets[weekStart] = { correct: 0, total: 0 };
    weekBuckets[weekStart].total++;
    if (a.is_correct) weekBuckets[weekStart].correct++;
  }

  const weeklyAccuracies = Object.entries(weekBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => (data.correct / data.total) * 100);

  // Weekly growth rate
  const { slope } = linearRegression(weeklyAccuracies);
  const weeklyGrowthRate = Math.round(slope * 10) / 10;

  // Overall trend
  let overallTrend: GrowthTrajectory['overallTrend'];
  if (slope > 3) overallTrend = 'accelerating';
  else if (slope > 0.5) overallTrend = 'steady';
  else if (slope > -0.5) overallTrend = 'plateauing';
  else overallTrend = 'declining';

  // Best performing time of day
  const hourBuckets: Record<number, { correct: number; total: number }> = {};
  for (const a of sorted) {
    const hour = new Date(a.created_at).getHours();
    if (!hourBuckets[hour]) hourBuckets[hour] = { correct: 0, total: 0 };
    hourBuckets[hour].total++;
    if (a.is_correct) hourBuckets[hour].correct++;
  }

  let bestHour = 12;
  let bestAccuracy = 0;
  for (const [hour, data] of Object.entries(hourBuckets)) {
    if (data.total < 5) continue;
    const acc = data.correct / data.total;
    if (acc > bestAccuracy) {
      bestAccuracy = acc;
      bestHour = Number(hour);
    }
  }

  const bestPerformingTime = bestHour < 6 ? 'late night' 
    : bestHour < 12 ? 'morning'
    : bestHour < 17 ? 'afternoon'
    : bestHour < 21 ? 'evening'
    : 'night';

  // Consistency score: how many days in the last 14 had activity
  const last14Days = new Set<string>();
  const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
  for (const a of sorted) {
    if (new Date(a.created_at).getTime() > fourteenDaysAgo) {
      last14Days.add(new Date(a.created_at).toISOString().split('T')[0]);
    }
  }
  const consistencyScore = Math.round((last14Days.size / 14) * 100);

  // Project milestones
  const currentOverallAccuracy = weeklyAccuracies.length > 0 
    ? weeklyAccuracies[weeklyAccuracies.length - 1] : 50;
  
  const projectedMilestones: GrowthTrajectory['projectedMilestones'] = [];
  
  if (currentOverallAccuracy < 70 && weeklyGrowthRate > 0) {
    const weeksTo70 = Math.ceil((70 - currentOverallAccuracy) / weeklyGrowthRate);
    const date70 = new Date(Date.now() + weeksTo70 * 7 * 24 * 60 * 60 * 1000);
    projectedMilestones.push({
      milestone: 'Reach 70% overall accuracy',
      estimatedDate: date70.toISOString().split('T')[0],
      probability: Math.min(80, Math.round(50 + weeklyGrowthRate * 10)),
    });
  }

  if (currentOverallAccuracy < 85 && weeklyGrowthRate > 0) {
    const weeksTo85 = Math.ceil((85 - currentOverallAccuracy) / weeklyGrowthRate);
    const date85 = new Date(Date.now() + weeksTo85 * 7 * 24 * 60 * 60 * 1000);
    projectedMilestones.push({
      milestone: 'Reach Advanced level (85%+)',
      estimatedDate: date85.toISOString().split('T')[0],
      probability: Math.min(60, Math.round(30 + weeklyGrowthRate * 8)),
    });
  }

  return {
    overallTrend,
    weeklyGrowthRate,
    bestPerformingTime,
    consistencyScore,
    projectedMilestones,
  };
}

/**
 * Generate a predictive engine context string for AI prompt injection.
 */
export function getPredictiveContextPrompt(
  answerHistory: Array<{ subject: string; is_correct: boolean; created_at: string }>,
  subject?: string,
): string {
  if (answerHistory.length < 10) return '';

  const velocity = calculateLearningVelocity(answerHistory);
  const forecasts = forecastPerformance(answerHistory);
  const growth = modelGrowthTrajectory(answerHistory);
  const transfers = analyzeCrossSubjectTransfer(answerHistory);

  const sections: string[] = [];

  // Learning velocity
  sections.push(`## LEARNING VELOCITY`);
  sections.push(`- Pace: ${velocity.paceLabel.replace('_', ' ')} (${velocity.relativePace}x average)`);
  sections.push(`- Accuracy gain: +${velocity.accuracyGainRate}% per 10 questions`);

  const paceInstructions: Record<string, string> = {
    very_fast: 'This student learns VERY quickly. Move briskly, minimize repetition, provide advanced challenges immediately.',
    fast: 'This student learns quickly. Keep a good pace, include moderate challenges.',
    average: 'This student learns at a normal pace. Balance explanation with practice.',
    slow: 'This student needs more time. Be extra patient, provide more examples, check understanding frequently.',
    very_slow: 'This student needs significant support. Break everything into tiny steps. Use many concrete examples. Check understanding after EVERY concept.',
  };
  sections.push(`PACING: ${paceInstructions[velocity.paceLabel]}`);

  // Subject-specific velocity
  if (subject) {
    const subVel = velocity.subjectVelocities[subject.toLowerCase()];
    if (subVel) {
      sections.push(`\n${subject} trajectory: ${subVel.currentTrajectory} | ~${subVel.questionsToMastery} questions to mastery`);
    }
  }

  // Performance forecasts
  const relevantForecasts = subject 
    ? forecasts.filter(f => f.subject === subject.toLowerCase())
    : forecasts.slice(0, 3);

  if (relevantForecasts.length > 0) {
    sections.push(`\n## PERFORMANCE FORECAST`);
    for (const f of relevantForecasts) {
      sections.push(`- ${f.subject}: ${f.currentAccuracy}% now → ${f.predictedAccuracyIn7Days}% in 7 days | ${f.trajectory} | ${f.riskLevel.replace('_', ' ')}`);
      if (f.riskLevel === 'falling_behind') {
        sections.push(`  ⚠️ FALLING BEHIND in ${f.subject}. Increase support intensity. Consider going back to basics.`);
      } else if (f.riskLevel === 'excelling') {
        sections.push(`  ⭐ EXCELLING in ${f.subject}. Challenge with advanced material.`);
      }
    }
  }

  // Growth trajectory
  sections.push(`\n## GROWTH TRAJECTORY: ${growth.overallTrend}`);
  sections.push(`- Weekly growth: ${growth.weeklyGrowthRate > 0 ? '+' : ''}${growth.weeklyGrowthRate}%/week`);
  sections.push(`- Study consistency: ${growth.consistencyScore}% (${growth.consistencyScore > 70 ? 'excellent' : growth.consistencyScore > 40 ? 'moderate' : 'needs improvement'})`);
  sections.push(`- Best study time: ${growth.bestPerformingTime}`);

  if (growth.overallTrend === 'plateauing') {
    sections.push(`\nPLATEAU DETECTED: The student's growth has stalled. Try: new teaching approaches, varied question types, real-world applications, or connecting to their interests.`);
  }

  // Cross-subject transfer
  if (transfers.length > 0) {
    sections.push(`\n## CROSS-SUBJECT CONNECTIONS`);
    for (const t of transfers.slice(0, 3)) {
      sections.push(`- ${t.sourceSubject} ↔ ${t.targetSubject}: ${t.transferType} transfer (r=${t.correlationStrength})`);
      if (t.recommendation) sections.push(`  → ${t.recommendation}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
//  MATH UTILITIES
// ============================================================================

function linearRegression(values: number[]): { slope: number; intercept: number } {
  if (values.length < 2) return { slope: 0, intercept: values[0] || 0 };

  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}
