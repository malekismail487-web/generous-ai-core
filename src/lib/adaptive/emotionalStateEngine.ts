/**
 * Emotional State Engine - Detects and responds to student emotional states
 * Tracks fatigue, frustration, engagement, and confidence
 */

export interface EmotionalState {
  fatigue: number;        // 0-1, 1 = exhausted
  frustration: number;    // 0-1, 1 = very frustrated
  engagement: number;     // 0-1, 1 = highly engaged
  confidence: number;     // 0-1, 1 = very confident
  anxiety: number;        // 0-1, 1 = high anxiety
  lastUpdated: Date;
}

export interface BehavioralSignals {
  responseTime: number;           // ms
  responseTimeVariance: number;   // consistency
  hesitationCount: number;        // pauses/changes
  errorPattern: 'random' | 'systematic' | 'careless';
  consecutiveErrors: number;
  consecutiveCorrect: number;
  sessionDuration: number;        // minutes
  breakFrequency: number;         // breaks per hour
}

export class EmotionalStateEngine {
  private state: EmotionalState;
  private behavioralHistory: BehavioralSignals[];
  private decayRates: {
    fatigue: number;
    frustration: number;
    engagement: number;
    confidence: number;
    anxiety: number;
  };

  constructor() {
    this.state = {
      fatigue: 0,
      frustration: 0,
      engagement: 1,
      confidence: 0.5,
      anxiety: 0,
      lastUpdated: new Date()
    };
    
    this.behavioralHistory = [];
    
    // Decay rates per minute
    this.decayRates = {
      fatigue: 0.02,
      frustration: 0.05,
      engagement: 0.03,
      confidence: 0.01,
      anxiety: 0.04
    };
  }

  /**
   * Update emotional state based on behavioral signals
   */
  updateEmotionalState(signals: BehavioralSignals): void {
    this.behavioralHistory.push(signals);
    
    // Keep only recent history (last 20 interactions)
    if (this.behavioralHistory.length > 20) {
      this.behavioralHistory.shift();
    }

    // Update fatigue based on session duration and response time
    const timeFactor = Math.min(1, signals.sessionDuration / 60); // Max at 60 min
    const slowResponseFactor = signals.responseTime > 10000 ? 0.3 : 0;
    this.state.fatigue = Math.min(1, this.state.fatigue + 0.01 + timeFactor * 0.02 + slowResponseFactor);

    // Update frustration based on error patterns
    if (signals.consecutiveErrors >= 3) {
      this.state.frustration = Math.min(1, this.state.frustration + 0.15);
    } else if (signals.consecutiveErrors >= 1) {
      this.state.frustration = Math.min(1, this.state.frustration + 0.05);
    } else if (signals.consecutiveCorrect >= 3) {
      this.state.frustration = Math.max(0, this.state.frustration - 0.1);
    }

    // Update engagement
    if (signals.responseTimeVariance > 5000) {
      // High variance suggests distraction
      this.state.engagement = Math.max(0, this.state.engagement - 0.05);
    } else if (signals.responseTime < 3000 && signals.consecutiveCorrect > 0) {
      // Quick, correct responses suggest high engagement
      this.state.engagement = Math.min(1, this.state.engagement + 0.05);
    }

    // Update confidence based on performance
    const recentAccuracy = this.calculateRecentAccuracy();
    if (recentAccuracy > 0.8) {
      this.state.confidence = Math.min(1, this.state.confidence + 0.05);
    } else if (recentAccuracy < 0.4) {
      this.state.confidence = Math.max(0, this.state.confidence - 0.08);
    }

    // Update anxiety based on error patterns and time pressure
    if (signals.errorPattern === 'systematic' && signals.consecutiveErrors >= 2) {
      this.state.anxiety = Math.min(1, this.state.anxiety + 0.1);
    }
    if (signals.responseTime < 2000 && !signals.consecutiveCorrect) {
      // Rushing without success
      this.state.anxiety = Math.min(1, this.state.anxiety + 0.05);
    }

    this.state.lastUpdated = new Date();
  }

  /**
   * Calculate accuracy from recent behavioral history
   */
  private calculateRecentAccuracy(): number {
    if (this.behavioralHistory.length === 0) return 0.5;
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    for (const signals of this.behavioralHistory) {
      totalCorrect += signals.consecutiveCorrect;
      totalQuestions += signals.consecutiveCorrect + signals.consecutiveErrors;
    }
    
    return totalQuestions > 0 ? totalCorrect / totalQuestions : 0.5;
  }

  /**
   * Apply natural decay to emotional states over time
   */
  applyDecay(elapsedMinutes: number): void {
    this.state.fatigue = Math.max(0, this.state.fatigue - this.decayRates.fatigue * elapsedMinutes);
    this.state.frustration = Math.max(0, this.state.frustration - this.decayRates.frustration * elapsedMinutes);
    this.state.engagement = Math.max(0, this.state.engagement - this.decayRates.engagement * elapsedMinutes);
    this.state.confidence = Math.max(0, this.state.confidence - this.decayRates.confidence * elapsedMinutes);
    this.state.anxiety = Math.max(0, this.state.anxiety - this.decayRates.anxiety * elapsedMinutes);
    
    // Natural recovery toward baseline
    this.state.engagement = Math.min(1, this.state.engagement + 0.02 * elapsedMinutes);
  }

  /**
   * Get difficulty modifier based on emotional state
   * Returns a value between -1 and 1 to adjust question difficulty
   */
  getDifficultyModifier(): number {
    let modifier = 0;
    
    // High fatigue → reduce difficulty
    if (this.state.fatigue > 0.7) {
      modifier -= 0.5;
    } else if (this.state.fatigue > 0.4) {
      modifier -= 0.2;
    }
    
    // High frustration → reduce difficulty
    if (this.state.frustration > 0.6) {
      modifier -= 0.4;
    }
    
    // High anxiety → slightly reduce difficulty
    if (this.state.anxiety > 0.5) {
      modifier -= 0.2;
    }
    
    // Low engagement → slightly easier to re-engage
    if (this.state.engagement < 0.3) {
      modifier -= 0.1;
    }
    
    // High confidence → can increase difficulty slightly
    if (this.state.confidence > 0.8 && this.state.frustration < 0.3) {
      modifier += 0.1;
    }
    
    return Math.max(-1, Math.min(1, modifier));
  }

  /**
   * Get intervention recommendations based on emotional state
   */
  getInterventionRecommendations(): string[] {
    const recommendations: string[] = [];
    
    if (this.state.fatigue > 0.7) {
      recommendations.push('Suggest taking a short break');
      recommendations.push('Reduce session intensity');
    }
    
    if (this.state.frustration > 0.6) {
      recommendations.push('Provide encouragement message');
      recommendations.push('Switch to easier problems temporarily');
      recommendations.push('Show progress and achievements');
    }
    
    if (this.state.anxiety > 0.5) {
      recommendations.push('Remind student it\'s okay to make mistakes');
      recommendations.push('Remove time pressure if applicable');
    }
    
    if (this.state.engagement < 0.3) {
      recommendations.push('Introduce gamification element');
      recommendations.push('Change problem type or format');
      recommendations.push('Set small, achievable goal');
    }
    
    if (this.state.confidence < 0.3) {
      recommendations.push('Provide scaffolded hints');
      recommendations.push('Celebrate small wins');
    }
    
    return recommendations;
  }

  /**
   * Get current emotional state
   */
  getState(): EmotionalState {
    return { ...this.state };
  }

  /**
   * Reset emotional state (e.g., new session)
   */
  reset(): void {
    this.state = {
      fatigue: 0,
      frustration: 0,
      engagement: 1,
      confidence: 0.5,
      anxiety: 0,
      lastUpdated: new Date()
    };
    this.behavioralHistory = [];
  }
}
