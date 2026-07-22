/**
 * Cognitive Model - Tracks student cognitive state and learning progress
 * Integrates multiple signals for holistic understanding
 */

import { ConceptGraph, ConceptMastery } from './conceptGraph';
import { EmotionalState, BehavioralSignals } from './emotionalStateEngine';
import { MistakePattern } from './mistakeAnalyzer';

export interface CognitiveState {
  workingMemoryLoad: number;      // 0-1, cognitive load estimate
  attentionLevel: number;         // 0-1, focus/attention
  processingSpeed: number;        // relative speed estimate
  metacognitiveAwareness: number; // 0-1, self-monitoring ability
  cognitiveFatigue: number;       // 0-1, mental exhaustion
  learningEfficiency: number;     // 0-1, how effectively learning occurs
  lastUpdated: Date;
}

export interface LearningProgress {
  conceptsMastered: number;
  conceptsInProgress: number;
  conceptsNotStarted: number;
  overallMastery: number;         // 0-1
  learningVelocity: number;       // concepts per session
  retentionRate: number;          // 0-1, long-term retention
}

export class CognitiveModel {
  private state: CognitiveState;
  private conceptGraph: ConceptGraph;
  private sessionHistory: Array<{
    duration: number;
    conceptsCovered: number;
    accuracy: number;
    avgResponseTime: number;
  }>;
  private baselineMetrics: {
    avgResponseTime: number;
    accuracy: number;
    sessionDuration: number;
  };

  constructor(conceptGraph: ConceptGraph) {
    this.conceptGraph = conceptGraph;
    this.state = {
      workingMemoryLoad: 0.5,
      attentionLevel: 1,
      processingSpeed: 1,
      metacognitiveAwareness: 0.5,
      cognitiveFatigue: 0,
      learningEfficiency: 0.5,
      lastUpdated: new Date()
    };
    
    this.sessionHistory = [];
    this.baselineMetrics = {
      avgResponseTime: 5000,
      accuracy: 0.7,
      sessionDuration: 20
    };
  }

  /**
   * Update cognitive state based on behavioral and emotional signals
   */
  updateCognitiveState(
    emotionalState: EmotionalState,
    behavioralSignals: BehavioralSignals,
    mistakePatterns?: MistakePattern[]
  ): void {
    // Update working memory load based on problem difficulty and errors
    const errorLoad = behavioralSignals.consecutiveErrors * 0.1;
    const complexityLoad = this.estimateCurrentComplexity();
    this.state.workingMemoryLoad = Math.min(1, 
      errorLoad + complexityLoad + emotionalState.fatigue * 0.3
    );

    // Update attention level from engagement and response patterns
    const engagementFactor = emotionalState.engagement;
    const consistencyFactor = 1 - Math.min(1, behavioralSignals.responseTimeVariance / 10000);
    this.state.attentionLevel = (engagementFactor + consistencyFactor) / 2;

    // Update processing speed relative to baseline
    const speedRatio = this.baselineMetrics.avgResponseTime / behavioralSignals.responseTime;
    this.state.processingSpeed = Math.max(0.5, Math.min(1.5, speedRatio));

    // Estimate metacognitive awareness from error detection
    const metacogFromPatterns = mistakePatterns && mistakePatterns.length > 0
      ? this.estimateMetacognition(mistakePatterns)
      : 0.5;
    this.state.metacognitiveAwareness = metacogFromPatterns;

    // Update cognitive fatigue
    this.state.cognitiveFatigue = emotionalState.fatigue;

    // Calculate learning efficiency
    this.state.learningEfficiency = this.calculateLearningEfficiency(behavioralSignals);

    this.state.lastUpdated = new Date();
  }

  /**
   * Estimate current problem complexity from concept graph
   */
  private estimateCurrentComplexity(): number {
    // Could be enhanced to track current problem being solved
    const allConcepts = this.conceptGraph.getAllConcepts();
    if (allConcepts.length === 0) return 0.5;
    
    const avgDifficulty = allConcepts.reduce((sum, c) => sum + c.difficulty, 0) / allConcepts.length;
    return avgDifficulty;
  }

  /**
   * Estimate metacognitive awareness from mistake patterns
   */
  private estimateMetacognition(patterns: MistakePattern[]): number {
    // High awareness = recognizing and correcting errors
    const carelessErrors = patterns.filter(p => p.patternType === 'careless_error');
    const systematicErrors = patterns.filter(p => p.patternType === 'systematic_misconception');
    
    // Fewer careless errors suggests better self-monitoring
    const carelessPenalty = carelessErrors.length * 0.1;
    
    // Systematic errors without correction suggests low awareness
    const systematicPenalty = systematicErrors.length * 0.15;
    
    return Math.max(0, 1 - carelessPenalty - systematicPenalty);
  }

  /**
   * Calculate learning efficiency metric
   */
  private calculateLearningEfficiency(signals: BehavioralSignals): number {
    // Efficiency = accuracy / (time * effort)
    const accuracy = signals.consecutiveCorrect / (signals.consecutiveCorrect + signals.consecutiveErrors + 1);
    const timeFactor = Math.min(1, signals.responseTime / 10000);
    const effortFactor = 1 - (signals.hesitationCount / 10);
    
    return accuracy * (1 - timeFactor) * effortFactor;
  }

  /**
   * Record session data for trend analysis
   */
  recordSession(duration: number, conceptsCovered: number, accuracy: number, avgResponseTime: number): void {
    this.sessionHistory.push({
      duration,
      conceptsCovered,
      accuracy,
      avgResponseTime
    });

    // Keep last 20 sessions
    if (this.sessionHistory.length > 20) {
      this.sessionHistory.shift();
    }

    // Update baseline metrics
    this.updateBaselineMetrics();
  }

  /**
   * Update baseline metrics from session history
   */
  private updateBaselineMetrics(): void {
    if (this.sessionHistory.length === 0) return;

    const recentSessions = this.sessionHistory.slice(-10);
    
    const avgTime = recentSessions.reduce((sum, s) => sum + s.avgResponseTime, 0) / recentSessions.length;
    const avgAccuracy = recentSessions.reduce((sum, s) => sum + s.accuracy, 0) / recentSessions.length;
    const avgDuration = recentSessions.reduce((sum, s) => sum + s.duration, 0) / recentSessions.length;

    this.baselineMetrics = {
      avgResponseTime: avgTime,
      accuracy: avgAccuracy,
      sessionDuration: avgDuration
    };
  }

  /**
   * Get overall learning progress
   */
  getLearningProgress(): LearningProgress {
    const allConcepts = this.conceptGraph.getAllConcepts();
    let mastered = 0;
    let inProgress = 0;
    let notStarted = 0;
    let totalMastery = 0;

    for (const concept of allConcepts) {
      const mastery = this.conceptGraph.getMastery(concept.id);
      totalMastery += mastery;
      
      if (mastery >= 0.8) {
        mastered++;
      } else if (mastery >= 0.3) {
        inProgress++;
      } else {
        notStarted++;
      }
    }

    const overallMastery = allConcepts.length > 0 ? totalMastery / allConcepts.length : 0;
    
    // Calculate learning velocity (concepts per session)
    const recentVelocity = this.sessionHistory.slice(-5)
      .reduce((sum, s) => sum + s.conceptsCovered, 0) / Math.max(1, this.sessionHistory.slice(-5).length);

    // Estimate retention rate from session accuracy trends
    const retentionRate = this.sessionHistory.length >= 2
      ? this.sessionHistory[this.sessionHistory.length - 1].accuracy
      : 0.5;

    return {
      conceptsMastered: mastered,
      conceptsInProgress: inProgress,
      conceptsNotStarted: notStarted,
      overallMastery,
      learningVelocity: recentVelocity,
      retentionRate
    };
  }

  /**
   * Get cognitive state
   */
  getCognitiveState(): CognitiveState {
    return { ...this.state };
  }

  /**
   * Get recommendations based on cognitive state
   */
  getCognitiveRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.state.workingMemoryLoad > 0.8) {
      recommendations.push('Reduce problem complexity temporarily');
      recommendations.push('Break tasks into smaller chunks');
    }

    if (this.state.attentionLevel < 0.4) {
      recommendations.push('Take a short break to refocus');
      recommendations.push('Try active learning techniques');
    }

    if (this.state.cognitiveFatigue > 0.7) {
      recommendations.push('End session and rest');
      recommendations.push('Switch to review mode instead of new content');
    }

    if (this.state.metacognitiveAwareness < 0.4) {
      recommendations.push('Practice self-explanation strategies');
      recommendations.push('Use reflection prompts after each problem');
    }

    if (this.state.learningEfficiency < 0.3) {
      recommendations.push('Review study strategies');
      recommendations.push('Consider changing learning approach');
    }

    return recommendations;
  }

  /**
   * Reset cognitive state (new student or fresh start)
   */
  reset(): void {
    this.state = {
      workingMemoryLoad: 0.5,
      attentionLevel: 1,
      processingSpeed: 1,
      metacognitiveAwareness: 0.5,
      cognitiveFatigue: 0,
      learningEfficiency: 0.5,
      lastUpdated: new Date()
    };
    this.sessionHistory = [];
  }
}
