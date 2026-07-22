/**
 * Mistake Analyzer - Analyzes error patterns to identify misconceptions
 * Provides targeted remediation based on mistake types
 */

export interface Mistake {
  id: string;
  questionId: string;
  conceptId: string;
  studentResponse: any;
  correctAnswer: any;
  timestamp: Date;
  timeSpent: number;        // ms
  attemptNumber: number;
}

export interface MistakePattern {
  conceptId: string;
  patternType: MistakePatternType;
  frequency: number;
  lastOccurrence: Date;
  severity: 'low' | 'medium' | 'high';
  description: string;
  remediationSuggestions: string[];
}

export type MistakePatternType = 
  | 'careless_error'
  | 'systematic_misconception'
  | 'knowledge_gap'
  | 'procedural_error'
  | 'conceptual_confusion'
  | 'transfer_failure'
  | 'time_pressure';

export class MistakeAnalyzer {
  private mistakes: Mistake[];
  private patterns: Map<string, MistakePattern>;
  private conceptHistory: Map<string, Mistake[]>;

  constructor() {
    this.mistakes = [];
    this.patterns = new Map();
    this.conceptHistory = new Map();
  }

  /**
   * Record a new mistake
   */
  recordMistake(mistake: Mistake): void {
    this.mistakes.push(mistake);
    
    // Add to concept history
    if (!this.conceptHistory.has(mistake.conceptId)) {
      this.conceptHistory.set(mistake.conceptId, []);
    }
    this.conceptHistory.get(mistake.conceptId)?.push(mistake);

    // Keep only recent mistakes (last 100)
    if (this.mistakes.length > 100) {
      this.mistakes.shift();
    }

    // Analyze and update patterns
    this.analyzePatterns(mistake.conceptId);
  }

  /**
   * Analyze mistake patterns for a concept
   */
  private analyzePatterns(conceptId: string): void {
    const history = this.conceptHistory.get(conceptId) || [];
    if (history.length < 3) return; // Need sufficient data

    const recentMistakes = history.slice(-10); // Last 10 attempts
    
    // Detect pattern type
    const patternType = this.detectPatternType(recentMistakes);
    const frequency = recentMistakes.length;
    const severity = this.calculateSeverity(frequency, patternType);

    const pattern: MistakePattern = {
      conceptId,
      patternType,
      frequency,
      lastOccurrence: recentMistakes[recentMistakes.length - 1].timestamp,
      severity,
      description: this.getPatternDescription(patternType),
      remediationSuggestions: this.getRemediationSuggestions(patternType, conceptId)
    };

    this.patterns.set(conceptId, pattern);
  }

  /**
   * Detect the type of mistake pattern
   */
  private detectPatternType(mistakes: Mistake[]): MistakePatternType {
    if (mistakes.length === 0) return 'knowledge_gap';

    const avgTimeSpent = mistakes.reduce((sum, m) => sum + m.timeSpent, 0) / mistakes.length;
    const timeVariance = this.calculateVariance(mistakes.map(m => m.timeSpent));

    // Fast errors with high variance → careless errors
    if (avgTimeSpent < 3000 && timeVariance > 1000000) {
      return 'careless_error';
    }

    // Slow errors with low variance → systematic misconception
    if (avgTimeSpent > 10000 && timeVariance < 500000) {
      return 'systematic_misconception';
    }

    // Very fast errors consistently → time pressure
    if (avgTimeSpent < 2000) {
      return 'time_pressure';
    }

    // Errors on multi-step problems → procedural error
    if (mistakes.some(m => m.attemptNumber > 1)) {
      return 'procedural_error';
    }

    // Default to knowledge gap
    return 'knowledge_gap';
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  /**
   * Calculate severity based on frequency and pattern type
   */
  private calculateSeverity(frequency: number, patternType: MistakePatternType): 'low' | 'medium' | 'high' {
    const weightMultiplier: Record<MistakePatternType, number> = {
      'careless_error': 0.5,
      'systematic_misconception': 1.5,
      'knowledge_gap': 1.0,
      'procedural_error': 1.2,
      'conceptual_confusion': 1.4,
      'transfer_failure': 1.3,
      'time_pressure': 0.8
    };

    const weightedFrequency = frequency * (weightMultiplier[patternType] || 1.0);

    if (weightedFrequency >= 8) return 'high';
    if (weightedFrequency >= 4) return 'medium';
    return 'low';
  }

  /**
   * Get human-readable description for pattern type
   */
  private getPatternDescription(patternType: MistakePatternType): string {
    const descriptions: Record<MistakePatternType, string> = {
      'careless_error': 'Student makes quick errors, possibly due to lack of attention',
      'systematic_misconception': 'Student consistently applies incorrect reasoning or rule',
      'knowledge_gap': 'Student lacks fundamental knowledge needed for this concept',
      'procedural_error': 'Student understands concepts but makes errors in execution steps',
      'conceptual_confusion': 'Student confuses this concept with related concepts',
      'transfer_failure': 'Student can\'t apply knowledge to new problem formats',
      'time_pressure': 'Student performs poorly under time constraints'
    };
    return descriptions[patternType];
  }

  /**
   * Get remediation suggestions based on pattern type
   */
  private getRemediationSuggestions(patternType: MistakePatternType, conceptId: string): string[] {
    const suggestions: Record<MistakePatternType, string[]> = {
      'careless_error': [
        'Encourage slower, more deliberate work',
        'Implement check-your-work prompts',
        'Highlight common pitfalls explicitly',
        'Practice with metacognitive strategies'
      ],
      'systematic_misconception': [
        'Directly address the specific misconception',
        'Provide contrasting examples (correct vs incorrect)',
        'Use conceptual conflict activities',
        'Offer targeted explanation videos'
      ],
      'knowledge_gap': [
        'Review prerequisite concepts',
        'Provide foundational practice problems',
        'Use scaffolding and gradual release',
        'Offer glossary and reference materials'
      ],
      'procedural_error': [
        'Break down procedures into explicit steps',
        'Provide worked examples with annotations',
        'Practice with step-by-step feedback',
        'Create procedure checklists'
      ],
      'conceptual_confusion': [
        'Create concept comparison charts',
        'Highlight distinguishing features',
        'Provide sorting/categorization activities',
        'Use analogies to clarify differences'
      ],
      'transfer_failure': [
        'Practice with varied problem formats',
        'Explicitly teach transfer strategies',
        'Provide multiple contextual examples',
        'Encourage self-explanation of solutions'
      ],
      'time_pressure': [
        'Build fluency through timed practice',
        'Teach efficient problem-solving strategies',
        'Gradually increase time pressure',
        'Practice stress management techniques'
      ]
    };

    return suggestions[patternType] || ['Review concept fundamentals'];
  }

  /**
   * Get all detected patterns
   */
  getAllPatterns(): MistakePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern for a specific concept
   */
  getPattern(conceptId: string): MistakePattern | undefined {
    return this.patterns.get(conceptId);
  }

  /**
   * Get high-severity patterns requiring immediate attention
   */
  getHighPriorityPatterns(): MistakePattern[] {
    return Array.from(this.patterns.values()).filter(p => p.severity === 'high');
  }

  /**
   * Get recommendations for a student across all concepts
   */
  getOverallRecommendations(): Array<{
    conceptId: string;
    priority: number;
    actions: string[];
  }> {
    const recommendations: Array<{
      conceptId: string;
      priority: number;
      actions: string[];
    }> = [];

    const severityWeights: Record<string, number> = {
      'high': 3,
      'medium': 2,
      'low': 1
    };

    for (const [conceptId, pattern] of this.patterns.entries()) {
      const priority = severityWeights[pattern.severity] * pattern.frequency;
      recommendations.push({
        conceptId,
        priority,
        actions: pattern.remediationSuggestions.slice(0, 3) // Top 3 actions
      });
    }

    // Sort by priority (highest first)
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations;
  }

  /**
   * Clear all recorded mistakes and patterns
   */
  reset(): void {
    this.mistakes = [];
    this.patterns.clear();
    this.conceptHistory.clear();
  }
}
