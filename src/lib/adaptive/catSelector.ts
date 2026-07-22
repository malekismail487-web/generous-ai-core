/**
 * Computerized Adaptive Testing (CAT) Selector
 * Selects optimal questions based on student ability estimation using IRT
 */

import { ItemResponseTheory } from './irtEngine';
import { ConceptGraph } from './conceptGraph';
import { EmotionalStateEngine } from './emotionalStateEngine';

export interface Question {
  id: string;
  conceptId: string;
  difficulty: number;
  discrimination: number;
  guessing: number;
  content: any;
  tags: string[];
}

export interface CATState {
  estimatedAbility: number;
  standardError: number;
  administeredQuestions: string[];
  conceptMastery: Map<string, number>;
  confidenceLevel: number;
}

export class CATSelector {
  private irt: ItemResponseTheory;
  private conceptGraph: ConceptGraph;
  private emotionalEngine: EmotionalStateEngine;
  private questionPool: Question[];
  private state: CATState;

  constructor(
    questionPool: Question[],
    irt: ItemResponseTheory,
    conceptGraph: ConceptGraph,
    emotionalEngine: EmotionalStateEngine
  ) {
    this.questionPool = questionPool;
    this.irt = irt;
    this.conceptGraph = conceptGraph;
    this.emotionalEngine = emotionalEngine;
    this.state = {
      estimatedAbility: 0,
      standardError: Infinity,
      administeredQuestions: [],
      conceptMastery: new Map(),
      confidenceLevel: 0,
    };
  }

  /**
   * Select the next optimal question based on current ability estimate
   */
  selectNextQuestion(excludeIds: string[] = []): Question | null {
    const availableQuestions = this.questionPool.filter(
      (q) => !this.state.administeredQuestions.includes(q.id) &&
             !excludeIds.includes(q.id)
    );

    if (availableQuestions.length === 0) return null;

    // Factor in emotional state for difficulty adjustment
    const emotionalFactor = this.emotionalEngine.getDifficultyModifier();
    
    // Target difficulty should match current ability estimate
    const targetDifficulty = this.state.estimatedAbility + emotionalFactor;

    // Fisher Information-based selection
    let bestQuestion: Question | null = null;
    let maxInformation = -Infinity;

    for (const question of availableQuestions) {
      // Calculate Fisher Information at current ability estimate
      const information = this.irt.calculateFisherInformation(
        question,
        this.state.estimatedAbility
      );

      // Prefer questions targeting weak concepts
      const conceptWeight = this.getConceptWeight(question.conceptId);
      const weightedInformation = information * conceptWeight;

      if (weightedInformation > maxInformation) {
        maxInformation = weightedInformation;
        bestQuestion = question;
      }
    }

    return bestQuestion;
  }

  /**
   * Update ability estimate after student response
   */
  updateEstimate(questionId: string, correct: boolean, responseTime?: number): void {
    const question = this.questionPool.find(q => q.id === questionId);
    if (!question) return;

    // Update administered questions
    this.state.administeredQuestions.push(questionId);

    // Update ability estimate using MLE or Bayesian estimation
    const newAbility = this.irt.updateAbilityEstimate(
      this.state.estimatedAbility,
      question,
      correct
    );

    // Calculate new standard error
    const newSE = this.irt.calculateStandardError(
      this.state.administeredQuestions,
      this.questionPool,
      newAbility
    );

    // Update concept mastery
    const currentMastery = this.state.conceptMastery.get(question.conceptId) || 0.5;
    const updatedMastery = correct 
      ? Math.min(1, currentMastery + 0.1)
      : Math.max(0, currentMastery - 0.05);
    this.state.conceptMastery.set(question.conceptId, updatedMastery);

    this.state.estimatedAbility = newAbility;
    this.state.standardError = newSE;
    this.state.confidenceLevel = 1 / (1 + newSE);
  }

  /**
   * Check if testing should terminate
   */
  shouldTerminate(): boolean {
    // Termination criteria:
    // 1. Standard error below threshold
    // 2. Maximum questions reached
    // 3. Ability estimate stable
    // 4. All relevant concepts assessed
    
    const SE_THRESHOLD = 0.3;
    const MAX_QUESTIONS = 20;
    const STABILITY_WINDOW = 5;

    if (this.state.standardError < SE_THRESHOLD) return true;
    if (this.state.administeredQuestions.length >= MAX_QUESTIONS) return true;

    // Check stability of last few estimates
    if (this.state.administeredQuestions.length >= STABILITY_WINDOW) {
      // Could implement stability check here
    }

    return false;
  }

  /**
   * Get weight for a concept based on mastery and importance
   */
  private getConceptWeight(conceptId: string): number {
    const mastery = this.state.conceptMastery.get(conceptId) || 0.5;
    const conceptImportance = this.conceptGraph.getConceptImportance(conceptId);
    
    // Higher weight for less mastered but important concepts
    return (1 - mastery) * conceptImportance;
  }

  /**
   * Get current CAT state
   */
  getState(): CATState {
    return { ...this.state };
  }

  /**
   * Reset CAT session
   */
  reset(initialAbility?: number): void {
    this.state = {
      estimatedAbility: initialAbility || 0,
      standardError: Infinity,
      administeredQuestions: [],
      conceptMastery: new Map(),
      confidenceLevel: 0,
    };
  }
}
