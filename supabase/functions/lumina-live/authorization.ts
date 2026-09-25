/** Pure decision used by the edge gateway and a separate multi-client harness. */
export interface LiveCaller {
  schoolId: string;
  gradeLevel: string | null;
  userType: string;
  active: boolean;
}

export interface LiveMeeting {
  lesson_id: string;
  school_id: string;
  grade_level: string;
  status: string;
}

export interface DurableEvent {
  lesson_id: string;
  school_id: string;
  seq: number;
  kind: string;
  text: string;
  priority: number;
  teacher_visible: boolean;
  ts: string;
}

export interface SubmittedEvent {
  id: string;
  lessonId: string;
  kind: string;
  text: string;
  priority: number;
  teacherVisible: boolean;
  ts: number;
}

export function eventSequence(lessonId: string, eventId: string): number | null {
  const prefix = `${lessonId}#`;
  if (!eventId.startsWith(prefix)) return null;
  const raw = eventId.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const seq = Number(raw);
  return Number.isSafeInteger(seq) ? seq : null;
}

export function authorizeLiveExplanation(
  caller: LiveCaller,
  meeting: LiveMeeting | null,
  durable: DurableEvent | null,
  submitted: SubmittedEvent,
): boolean {
  if (!caller.active || caller.userType !== 'student' || !caller.gradeLevel) return false;
  if (!meeting || meeting.status !== 'live' || meeting.lesson_id !== submitted.lessonId) return false;
  if (meeting.school_id !== caller.schoolId || meeting.grade_level !== caller.gradeLevel) return false;
  if (!durable || !durable.teacher_visible || !submitted.teacherVisible) return false;
  if (durable.lesson_id !== meeting.lesson_id || durable.school_id !== meeting.school_id) return false;
  if (eventSequence(submitted.lessonId, submitted.id) !== durable.seq) return false;
  return durable.kind === submitted.kind && durable.text === submitted.text
    && durable.priority === submitted.priority && Date.parse(durable.ts) === submitted.ts;
}
