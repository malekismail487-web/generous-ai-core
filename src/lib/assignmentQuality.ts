export interface AuditableQuestion {
  questionTitle: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
}

export type ParsedAssignmentQuestion = AuditableQuestion & { correctAnswer: 'A' | 'B' | 'C' | 'D' };

/** The model is untrusted input. Reject unexpected response shapes before rendering or persistence. */
export function parseGeneratedQuestions(value: unknown): ParsedAssignmentQuestion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new Error('The question generator returned an invalid question list.');
  }
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('The question generator returned an invalid question.');
    const record = item as Record<string, unknown>;
    const fields = ['questionTitle', 'optionA', 'optionB', 'optionC', 'optionD'] as const;
    if (fields.some((field) => typeof record[field] !== 'string')) {
      throw new Error('The question generator omitted required question text.');
    }
    if (!['A', 'B', 'C', 'D'].includes(String(record.correctAnswer))) {
      throw new Error('The question generator returned an invalid answer key.');
    }
    return {
      questionTitle: record.questionTitle as string,
      optionA: record.optionA as string,
      optionB: record.optionB as string,
      optionC: record.optionC as string,
      optionD: record.optionD as string,
      correctAnswer: record.correctAnswer as ParsedAssignmentQuestion['correctAnswer'],
    };
  });
}

export type AssignmentIssueCode =
  | 'NO_QUESTIONS'
  | 'MISSING_STEM'
  | 'MISSING_OPTION'
  | 'INVALID_ANSWER'
  | 'DUPLICATE_OPTION'
  | 'DUPLICATE_STEM'
  | 'EXPLICIT_ANSWER_LEAK'
  | 'ANSWER_POSITION_SKEW';

export interface AssignmentIssue {
  code: AssignmentIssueCode;
  severity: 'blocking' | 'review';
  questionNumber?: number;
  relatedQuestionNumber?: number;
}

export interface AssignmentAudit {
  publishable: boolean;
  issues: AssignmentIssue[];
  blockingCount: number;
  reviewCount: number;
}

const optionLetters = ['A', 'B', 'C', 'D'] as const;
const canonical = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();

/** Deterministic structural checks, not a claim of pedagogical or factual correctness. */
export function auditAssignmentQuestions(questions: readonly AuditableQuestion[]): AssignmentAudit {
  const issues: AssignmentIssue[] = [];
  const seenStems = new Map<string, number>();
  const answerCounts = { A: 0, B: 0, C: 0, D: 0 };

  if (questions.length === 0) issues.push({ code: 'NO_QUESTIONS', severity: 'blocking' });

  questions.forEach((question, index) => {
    const questionNumber = index + 1;
    const stem = typeof question.questionTitle === 'string' ? canonical(question.questionTitle) : '';
    if (!stem) {
      issues.push({ code: 'MISSING_STEM', severity: 'blocking', questionNumber });
    } else {
      const prior = seenStems.get(stem);
      if (prior !== undefined) {
        issues.push({ code: 'DUPLICATE_STEM', severity: 'blocking', questionNumber, relatedQuestionNumber: prior });
      } else {
        seenStems.set(stem, questionNumber);
      }
      if (/\b(?:correct\s+answer|answer\s+key)\s*[:=]\s*[a-d]\b/iu.test(stem)) {
        issues.push({ code: 'EXPLICIT_ANSWER_LEAK', severity: 'blocking', questionNumber });
      }
    }

    const seenOptions = new Map<string, string>();
    for (const letter of optionLetters) {
      const raw = question[`option${letter}`];
      const option = typeof raw === 'string' ? canonical(raw) : '';
      if (!option) {
        issues.push({ code: 'MISSING_OPTION', severity: 'blocking', questionNumber });
        continue;
      }
      if (seenOptions.has(option)) {
        issues.push({ code: 'DUPLICATE_OPTION', severity: 'blocking', questionNumber });
      } else {
        seenOptions.set(option, letter);
      }
    }

    if (!optionLetters.includes(question.correctAnswer as typeof optionLetters[number])) {
      issues.push({ code: 'INVALID_ANSWER', severity: 'blocking', questionNumber });
    } else {
      answerCounts[question.correctAnswer as typeof optionLetters[number]]++;
    }
  });

  if (questions.length >= 8 && Math.max(...Object.values(answerCounts)) / questions.length >= 0.75) {
    issues.push({ code: 'ANSWER_POSITION_SKEW', severity: 'review' });
  }

  const blockingCount = issues.filter((issue) => issue.severity === 'blocking').length;
  return {
    publishable: blockingCount === 0,
    issues,
    blockingCount,
    reviewCount: issues.length - blockingCount,
  };
}

export function describeAssignmentIssue(issue: AssignmentIssue, language: string): string {
  const ar = language === 'ar';
  const prefix = issue.questionNumber ? (ar ? `السؤال ${issue.questionNumber}: ` : `Q${issue.questionNumber}: `) : '';
  const other = issue.relatedQuestionNumber;
  const labels: Record<AssignmentIssueCode, [string, string]> = {
    NO_QUESTIONS: ['Add at least one question.', 'أضف سؤالاً واحداً على الأقل.'],
    MISSING_STEM: ['The question text is missing.', 'نص السؤال مفقود.'],
    MISSING_OPTION: ['All four choices are required.', 'الخيارات الأربعة مطلوبة.'],
    INVALID_ANSWER: ['Select a valid answer key (A–D).', 'اختر إجابة صحيحة (A–D).'],
    DUPLICATE_OPTION: ['Two choices have identical text.', 'خياران لهما النص نفسه.'],
    DUPLICATE_STEM: [`Repeats question ${other}.`, `يكرر السؤال ${other}.`],
    EXPLICIT_ANSWER_LEAK: ['The question text reveals the answer key.', 'نص السؤال يكشف مفتاح الإجابة.'],
    ANSWER_POSITION_SKEW: ['Most answers use the same letter; review answer placement.', 'معظم الإجابات تستخدم الحرف نفسه؛ راجع ترتيبها.'],
  };
  return prefix + labels[issue.code][ar ? 1 : 0];
}

/** Full moderation input; callers can bound payload size at the transport boundary. */
export function assignmentScanText(questions: readonly AuditableQuestion[]): string {
  return questions.map((q) => [q.questionTitle, q.optionA, q.optionB, q.optionC, q.optionD].join(' ')).join('\n');
}
