import type { AuditableQuestion } from './assignmentQuality';

export interface ResponseQuestion extends AuditableQuestion { id?: string }
export interface ResponseSubmission {
  id: string;
  student_id: string;
  submitted_at: string;
  content: string | null;
}
export interface ResponseBreakdown {
  index: number;
  questionText: string;
  correctCount: number;
  totalAttempts: number;
  successRate: number | null;
  selections: Record<'A' | 'B' | 'C' | 'D', number>;
  correctAnswer: string;
  optionTexts: Record<'A' | 'B' | 'C' | 'D', string>;
}
export interface AssignmentResponseEvidence {
  breakdown: ResponseBreakdown[];
  includedSubmissions: number;
  unreadableSubmissions: number;
  supersededSubmissions: number;
}

export function parseResponseQuestions(value: unknown): ResponseQuestion[] {
  if (value === null) return []; // a non-quiz assignment legitimately has no question list
  if (!Array.isArray(value)) throw new Error('The assignment question list is not readable.');
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('The assignment contains an unreadable question.');
    const q = item as Record<string, unknown>;
    const title = q.questionTitle ?? q.question ?? q.text;
    const options = Array.isArray(q.options) ? q.options : null;
    const optionA = q.optionA ?? options?.[0];
    const optionB = q.optionB ?? options?.[1];
    const optionC = q.optionC ?? options?.[2];
    const optionD = q.optionD ?? options?.[3];
    const answer = q.correctAnswer ?? q.correct_answer;
    if ([title, optionA, optionB, optionC, optionD, answer].some((field) => typeof field !== 'string')) {
      throw new Error('The assignment contains an unreadable question.');
    }
    return {
      id: typeof q.id === 'string' ? q.id : undefined,
      questionTitle: title as string,
      optionA: optionA as string,
      optionB: optionB as string,
      optionC: optionC as string,
      optionD: optionD as string,
      correctAnswer: answer as string,
    };
  });
}

const letters = ['A', 'B', 'C', 'D'] as const;
type Letter = typeof letters[number];

function parseAnswers(content: string | null): unknown {
  if (!content) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed; // earlier position-indexed quiz format
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.answers && typeof record.answers === 'object' && !Array.isArray(record.answers)) return record.answers;
    if (Array.isArray(record.results)) {
      const entries = record.results as unknown[];
      const reconstructed: Record<string, string> = {};
      for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null) continue;
        const result = entry as Record<string, unknown>;
        if (typeof result.questionId === 'string' && typeof result.selectedAnswer === 'string') {
          reconstructed[result.questionId] = result.selectedAnswer;
        }
      }
      return reconstructed;
    }
  } catch { /* malformed content cannot be counted as incorrect */ }
  return null;
}

export function latestPerStudent<T extends ResponseSubmission>(submissions: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const submission of submissions) {
    const previous = latest.get(submission.student_id);
    if (!previous || submission.submitted_at > previous.submitted_at
      || (submission.submitted_at === previous.submitted_at && submission.id > previous.id)) {
      latest.set(submission.student_id, submission);
    }
  }
  return [...latest.values()];
}

/** Recompute correctness against the published key; never trust client-supplied isCorrect. */
export function buildAssignmentResponseEvidence(
  questions: readonly ResponseQuestion[], submissions: readonly ResponseSubmission[],
): AssignmentResponseEvidence {
  const breakdown: ResponseBreakdown[] = questions.map((question, index) => ({
    index,
    questionText: question.questionTitle || `Question ${index + 1}`,
    correctCount: 0,
    totalAttempts: 0,
    successRate: null,
    selections: { A: 0, B: 0, C: 0, D: 0 },
    correctAnswer: question.correctAnswer,
    optionTexts: { A: question.optionA, B: question.optionB, C: question.optionC, D: question.optionD },
  }));
  let unreadableSubmissions = 0;
  let includedSubmissions = 0;
  const latest = latestPerStudent(submissions);
  for (const submission of latest) {
    const answers = parseAnswers(submission.content);
    if (!answers) { unreadableSubmissions++; continue; }
    let counted = false;
    breakdown.forEach((item, index) => {
      const key = questions[index].id;
      const selected = Array.isArray(answers) ? answers[index]
        : key ? (answers as Record<string, unknown>)[key] : undefined;
      if (!letters.includes(selected as Letter)) return;
      item.selections[selected as Letter]++;
      item.totalAttempts++;
      if (selected === item.correctAnswer) item.correctCount++;
      counted = true;
    });
    if (counted) includedSubmissions++;
    else unreadableSubmissions++;
  }
  for (const item of breakdown) {
    item.successRate = item.totalAttempts > 0 ? Math.round(100 * item.correctCount / item.totalAttempts) : null;
  }
  return {
    breakdown,
    includedSubmissions,
    unreadableSubmissions,
    supersededSubmissions: submissions.length - latest.length,
  };
}
