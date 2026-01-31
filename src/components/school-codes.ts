// src/lib/school-codes.ts
export type SchoolCode = {
  name: string;
  id: string;
  schoolAdminEmail?: string; // first user to claim becomes admin
};

export const SCHOOL_CODES: Record<string, SchoolCode> = {
  'QMM0.01': { name: 'Qimam EL Hayat International Schools', id: 'qimam-el-hayat' },
  'LUMI100': { name: 'LUMI', id: 'lumi' },
  'TEST999': { name: 'Test School', id: 'test-school' },
  // You can extend this to thousands of codes if needed
  // 'ABC123': { name: 'Example School', id: 'example-school' },
};

export function getSchoolByCode(code: string): SchoolCode | null {
  const normalized = code.trim().toUpperCase();
  return SCHOOL_CODES[normalized] || null;
}
