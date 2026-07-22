/**
 * Item Response Theory (IRT) Engine
 * Implements 3PL (Three-Parameter Logistic) model for ability estimation
 */

import { Question } from './catSelector';

export interface IRTParameters {
  difficulty: number;     // b parameter
  discrimination: number; // a parameter  
  guessing: number;       // c parameter
}

export interface AbilityEstimate {
  theta: number;          // Ability estimate
  standardError: number;  // SE of estimate
  iterations: number;     // Number of MLE iterations
  converged: boolean;     // Whether MLE converged
}

export class ItemResponseTheory {
  /**
   * Calculate probability of correct response using 3PL model
   * P(θ) = c + (1-c) / (1 + exp(-a(θ-b)))
   */
  calculateProbability(question: Question, ability: number): number {
    const { difficulty: b, discrimination: a, guessing: c } = question;
    
    const exponent = -a * (ability - b);
    const logistic = 1 / (1 + Math.exp(exponent));
    
    return c + (1 - c) * logistic;
  }

  /**
   * Calculate log-likelihood for a set of responses
   */
  calculateLogLikelihood(
    questionIds: string[],
    responses: boolean[],
    questionPool: Question[],
    theta: number
  ): number {
    let logLik = 0;
    
    for (let i = 0; i < questionIds.length; i++) {
      const question = questionPool.find(q => q.id === questionIds[i]);
      if (!question) continue;
      
      const p = this.calculateProbability(question, theta);
      const correct = responses[i];
      
      // Log-likelihood contribution
      if (correct) {
        logLik += Math.log(Math.max(p, 1e-10));
      } else {
        logLik += Math.log(Math.max(1 - p, 1e-10));
      }
    }
    
    return logLik;
  }

  /**
   * Estimate ability using Maximum Likelihood Estimation (MLE)
   */
  estimateAbilityMLE(
    questionIds: string[],
    responses: boolean[],
    questionPool: Question[],
    initialTheta: number = 0,
    maxIterations: number = 20,
    tolerance: number = 1e-6
  ): AbilityEstimate {
    let theta = initialTheta;
    let prevTheta = theta;
    let iterations = 0;
    let converged = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      iterations = iter + 1;
      
      // Calculate first derivative (score function)
      const score = this.calculateScore(theta, questionIds, responses, questionPool);
      
      // Calculate second derivative (Fisher Information)
      const fisherInfo = this.calculateTotalFisherInformation(theta, questionIds, questionPool);
      
      if (Math.abs(fisherInfo) < 1e-10) break;
      
      // Newton-Raphson update
      theta = theta + score / fisherInfo;
      
      // Check convergence
      if (Math.abs(theta - prevTheta) < tolerance) {
        converged = true;
        break;
      }
      
      prevTheta = theta;
    }

    // Calculate standard error
    const standardError = this.calculateStandardError(questionIds, questionPool, theta);

    return {
      theta,
      standardError,
      iterations,
      converged
    };
  }

  /**
   * Calculate score function (first derivative of log-likelihood)
   */
  private calculateScore(
    theta: number,
    questionIds: string[],
    responses: boolean[],
    questionPool: Question[]
  ): number {
    let score = 0;
    
    for (let i = 0; i < questionIds.length; i++) {
      const question = questionPool.find(q => q.id === questionIds[i]);
      if (!question) continue;
      
      const p = this.calculateProbability(question, theta);
      const correct = responses[i] ? 1 : 0;
      
      // Derivative of log-likelihood for 3PL
      const numerator = correct - p;
      const denominator = p * (1 - p);
      
      if (denominator > 1e-10) {
        score += (numerator / denominator) * question.discrimination * p * (1 - p);
      }
    }
    
    return score;
  }

  /**
   * Calculate Fisher Information for a single question
   */
  calculateFisherInformation(question: Question, theta: number): number {
    const p = this.calculateProbability(question, theta);
    const q = 1 - p;
    
    // Fisher Information for 3PL model
    const numerator = Math.pow(question.discrimination, 2) * p * q;
    const denominator = Math.pow(p - question.guessing, 2);
    
    if (denominator < 1e-10) return 0;
    
    return numerator / denominator;
  }

  /**
   * Calculate total Fisher Information across all administered questions
   */
  private calculateTotalFisherInformation(
    theta: number,
    questionIds: string[],
    questionPool: Question[]
  ): number {
    let totalInfo = 0;
    
    for (const qid of questionIds) {
      const question = questionPool.find(q => q.id === qid);
      if (question) {
        totalInfo += this.calculateFisherInformation(question, theta);
      }
    }
    
    return totalInfo;
  }

  /**
   * Calculate standard error of ability estimate
   */
  calculateStandardError(
    questionIds: string[],
    questionPool: Question[],
    theta: number
  ): number {
    const fisherInfo = this.calculateTotalFisherInformation(theta, questionIds, questionPool);
    
    if (fisherInfo < 1e-10) return Infinity;
    
    return 1 / Math.sqrt(fisherInfo);
  }

  /**
   * Update ability estimate with new response (incremental)
   */
  updateAbilityEstimate(
    currentTheta: number,
    question: Question,
    correct: boolean,
    learningRate: number = 0.1
  ): number {
    const p = this.calculateProbability(question, currentTheta);
    const error = (correct ? 1 : 0) - p;
    
    // Gradient ascent update
    const gradient = error * question.discrimination;
    const newTheta = currentTheta + learningRate * gradient;
    
    // Bound ability estimate to reasonable range
    return Math.max(-4, Math.min(4, newTheta));
  }

  /**
   * Bayesian ability estimation with prior
   */
  estimateAbilityBayesian(
    questionIds: string[],
    responses: boolean[],
    questionPool: Question[],
    priorMean: number = 0,
    priorVariance: number = 1
  ): AbilityEstimate {
    // Could implement EAP (Expected A Posteriori) or MAP estimation
    // For now, use MLE as approximation
    return this.estimateAbilityMLE(questionIds, responses, questionPool, priorMean);
  }
}
