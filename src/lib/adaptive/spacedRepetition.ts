/**
 * Spaced Repetition Engine - Implements SM-2 and similar algorithms
 * Optimizes review scheduling for long-term retention
 */

export interface ReviewItem {
  id: string;
  conceptId: string;
  content: any;
  createdAt: Date;
}

export interface ReviewSchedule {
  itemId: string;
  nextReviewDate: Date;
  interval: number;         // days until next review
  easeFactor: number;       // EF (default 2.5)
  repetitions: number;      // consecutive correct recalls
  lastReviewed?: Date;
  retentionProbability: number; // estimated retention at next review
}

export class SpacedRepetitionEngine {
  private schedules: Map<string, ReviewSchedule>;
  private defaultEaseFactor: number = 2.5;
  private minimumInterval: number = 1;    // 1 day
  private maximumInterval: number = 365;  // 1 year

  constructor() {
    this.schedules = new Map();
  }

  /**
   * Initialize or reset schedule for an item
   */
  initializeItem(item: ReviewItem): ReviewSchedule {
    const schedule: ReviewSchedule = {
      itemId: item.id,
      nextReviewDate: new Date(), // Review immediately
      interval: this.minimumInterval,
      easeFactor: this.defaultEaseFactor,
      repetitions: 0,
      retentionProbability: 0.5
    };
    
    this.schedules.set(item.id, schedule);
    return schedule;
  }

  /**
   * Update schedule after a review session using SM-2 algorithm
   * @param quality - 0-5 scale (0=completely forgotten, 5=perfect recall)
   */
  updateAfterReview(itemId: string, quality: number): ReviewSchedule {
    const schedule = this.schedules.get(itemId);
    if (!schedule) {
      throw new Error(`No schedule found for item ${itemId}`);
    }

    // SM-2 Algorithm
    if (quality >= 3) {
      // Correct recall
      if (schedule.repetitions === 0) {
        schedule.interval = 1;
      } else if (schedule.repetitions === 1) {
        schedule.interval = 6;
      } else {
        schedule.interval = Math.round(
          schedule.interval * schedule.easeFactor
        );
      }
      
      schedule.repetitions++;
    } else {
      // Forgotten - reset
      schedule.repetitions = 0;
      schedule.interval = 1;
    }

    // Update ease factor
    schedule.easeFactor = Math.max(1.3, 
      schedule.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );

    // Clamp interval
    schedule.interval = Math.min(this.maximumInterval, 
      Math.max(this.minimumInterval, schedule.interval)
    );

    // Calculate next review date
    schedule.nextReviewDate = new Date();
    schedule.nextReviewDate.setDate(schedule.nextReviewDate.getDate() + schedule.interval);
    schedule.lastReviewed = new Date();

    // Estimate retention probability using Ebbinghaus forgetting curve
    schedule.retentionProbability = this.calculateRetentionProbability(
      schedule.easeFactor,
      schedule.interval,
      schedule.repetitions
    );

    this.schedules.set(itemId, schedule);
    return schedule;
  }

  /**
   * Calculate retention probability using exponential decay model
   */
  private calculateRetentionProbability(
    easeFactor: number,
    interval: number,
    repetitions: number
  ): number {
    // Simplified retention model based on spacing effect
    const baseRetention = 0.9;
    const decayRate = 0.1 / (easeFactor * Math.sqrt(repetitions + 1));
    
    return baseRetention * Math.exp(-decayRate * interval);
  }

  /**
   * Get items due for review
   */
  getDueItems(maxCount: number = 20): string[] {
    const now = new Date();
    const dueItems: Array<{ itemId: string; priority: number }> = [];

    for (const [itemId, schedule] of this.schedules.entries()) {
      if (schedule.nextReviewDate <= now) {
        // Priority based on how overdue and retention probability
        const daysOverdue = (now.getTime() - schedule.nextReviewDate.getTime()) / (1000 * 60 * 60 * 24);
        const priority = daysOverdue + (1 - schedule.retentionProbability) * 10;
        
        dueItems.push({ itemId, priority });
      }
    }

    // Sort by priority (highest first)
    dueItems.sort((a, b) => b.priority - a.priority);

    return dueItems.slice(0, maxCount).map(item => item.itemId);
  }

  /**
   * Get upcoming review schedule
   */
  getUpcomingReviews(daysAhead: number = 7): Array<{
    itemId: string;
    reviewDate: Date;
    interval: number;
    retentionProbability: number;
  }> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const upcoming: Array<{
      itemId: string;
      reviewDate: Date;
      interval: number;
      retentionProbability: number;
    }> = [];

    for (const [itemId, schedule] of this.schedules.entries()) {
      if (schedule.nextReviewDate > now && schedule.nextReviewDate <= futureDate) {
        upcoming.push({
          itemId,
          reviewDate: schedule.nextReviewDate,
          interval: schedule.interval,
          retentionProbability: schedule.retentionProbability
        });
      }
    }

    // Sort by review date
    upcoming.sort((a, b) => a.reviewDate.getTime() - b.reviewDate.getTime());

    return upcoming;
  }

  /**
   * Get schedule for a specific item
   */
  getSchedule(itemId: string): ReviewSchedule | undefined {
    return this.schedules.get(itemId);
  }

  /**
   * Get all schedules
   */
  getAllSchedules(): ReviewSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Remove item from scheduling
   */
  removeItem(itemId: string): void {
    this.schedules.delete(itemId);
  }

  /**
   * Reset all schedules
   */
  reset(): void {
    this.schedules.clear();
  }

  /**
   * Get statistics about the spaced repetition system
   */
  getStatistics(): {
    totalItems: number;
    dueNow: number;
    dueToday: number;
    averageRetention: number;
    averageInterval: number;
  } {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let dueNow = 0;
    let dueToday = 0;
    let totalRetention = 0;
    let totalInterval = 0;

    for (const schedule of this.schedules.values()) {
      if (schedule.nextReviewDate <= now) {
        dueNow++;
        dueToday++;
      } else if (schedule.nextReviewDate <= endOfDay) {
        dueToday++;
      }

      totalRetention += schedule.retentionProbability;
      totalInterval += schedule.interval;
    }

    const count = this.schedules.size || 1;

    return {
      totalItems: this.schedules.size,
      dueNow,
      dueToday,
      averageRetention: totalRetention / count,
      averageInterval: totalInterval / count
    };
  }
}
