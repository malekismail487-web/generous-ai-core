/**
 * Concept Graph - Represents knowledge structure and concept relationships
 */

export interface Concept {
  id: string;
  name: string;
  description?: string;
  difficulty: number;
  prerequisites: string[];  // IDs of prerequisite concepts
  relatedConcepts: string[]; // IDs of related concepts
  domain: string;
  importance: number;       // Weight for curriculum planning
}

export interface ConceptMastery {
  conceptId: string;
  masteryLevel: number;     // 0-1 scale
  lastAssessed: Date;
  evidenceCount: number;
  stability: number;        // How stable the mastery estimate is
}

export class ConceptGraph {
  private concepts: Map<string, Concept>;
  private masteryRecords: Map<string, ConceptMastery>;
  private adjacencyList: Map<string, Set<string>>;

  constructor() {
    this.concepts = new Map();
    this.masteryRecords = new Map();
    this.adjacencyList = new Map();
  }

  /**
   * Add a concept to the graph
   */
  addConcept(concept: Concept): void {
    this.concepts.set(concept.id, concept);
    
    // Build adjacency list for traversal
    if (!this.adjacencyList.has(concept.id)) {
      this.adjacencyList.set(concept.id, new Set());
    }
    
    for (const prereq of concept.prerequisites) {
      if (!this.adjacencyList.has(prereq)) {
        this.adjacencyList.set(prereq, new Set());
      }
      this.adjacencyList.get(prereq)?.add(concept.id);
    }
  }

  /**
   * Get concept by ID
   */
  getConcept(id: string): Concept | undefined {
    return this.concepts.get(id);
  }

  /**
   * Get all concepts in a domain
   */
  getConceptsByDomain(domain: string): Concept[] {
    return Array.from(this.concepts.values()).filter(c => c.domain === domain);
  }

  /**
   * Get prerequisites for a concept (recursive)
   */
  getAllPrerequisites(conceptId: string, visited: Set<string> = new Set()): string[] {
    const concept = this.concepts.get(conceptId);
    if (!concept || visited.has(conceptId)) return [];
    
    visited.add(conceptId);
    const prereqs: string[] = [...concept.prerequisites];
    
    for (const prereqId of concept.prerequisites) {
      prereqs.push(...this.getAllPrerequisites(prereqId, visited));
    }
    
    return [...new Set(prereqs)];
  }

  /**
   * Get learning path to master a target concept
   */
  getLearningPath(targetConceptId: string): string[] {
    const prerequisites = this.getAllPrerequisites(targetConceptId);
    
    // Topological sort to get proper learning order
    return this.topologicalSort(prerequisites, targetConceptId);
  }

  /**
   * Topological sort for learning order
   */
  private topologicalSort(prereqs: string[], target: string): string[] {
    const allConcepts = [...new Set([...prereqs, target])];
    const inDegree: Map<string, number> = new Map();
    const sorted: string[] = [];
    
    // Calculate in-degrees
    for (const id of allConcepts) {
      inDegree.set(id, 0);
    }
    
    for (const id of allConcepts) {
      const concept = this.concepts.get(id);
      if (concept) {
        for (const prereq of concept.prerequisites) {
          if (allConcepts.includes(prereq)) {
            inDegree.set(id, (inDegree.get(id) || 0) + 1);
          }
        }
      }
    }
    
    // Kahn's algorithm
    const queue: string[] = allConcepts.filter(id => (inDegree.get(id) || 0) === 0);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      
      const neighbors = this.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (allConcepts.includes(neighbor)) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        }
      }
    }
    
    return sorted;
  }

  /**
   * Update mastery level for a concept
   */
  updateMastery(conceptId: string, delta: number, isCorrect: boolean): ConceptMastery {
    let record = this.masteryRecords.get(conceptId);
    
    if (!record) {
      record = {
        conceptId,
        masteryLevel: 0.5,
        lastAssessed: new Date(),
        evidenceCount: 0,
        stability: 0
      };
    }
    
    // Update mastery with exponential moving average
    const learningRate = 0.1 / (1 + record.evidenceCount * 0.1);
    const targetMastery = isCorrect ? Math.min(1, record.masteryLevel + delta) : Math.max(0, record.masteryLevel - delta);
    record.masteryLevel = record.masteryLevel + learningRate * (targetMastery - record.masteryLevel);
    
    record.evidenceCount++;
    record.lastAssessed = new Date();
    record.stability = Math.min(1, record.stability + 0.05);
    
    this.masteryRecords.set(conceptId, record);
    return record;
  }

  /**
   * Get mastery level for a concept
   */
  getMastery(conceptId: string): number {
    const record = this.masteryRecords.get(conceptId);
    return record?.masteryLevel ?? 0.5;
  }

  /**
   * Get concept importance (for weighting in CAT)
   */
  getConceptImportance(conceptId: string): number {
    const concept = this.concepts.get(conceptId);
    return concept?.importance ?? 1.0;
  }

  /**
   * Find concepts that are ready to learn (all prerequisites mastered)
   */
  getReadyConcepts(domain?: string, masteryThreshold: number = 0.7): string[] {
    const ready: string[] = [];
    
    for (const [id, concept] of this.concepts.entries()) {
      if (domain && concept.domain !== domain) continue;
      
      const allPrereqsMastered = concept.prerequisites.every(prereqId => {
        const mastery = this.getMastery(prereqId);
        return mastery >= masteryThreshold;
      });
      
      if (allPrereqsMastered) {
        const currentMastery = this.getMastery(id);
        if (currentMastery < masteryThreshold) {
          ready.push(id);
        }
      }
    }
    
    return ready;
  }

  /**
   * Get all concepts in the graph
   */
  getAllConcepts(): Concept[] {
    return Array.from(this.concepts.values());
  }
}
