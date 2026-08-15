/**
 * RolePreviewPanel — Super Admin "test as role" surface.
 *
 * Replaces the previous hardcoded mock dashboards. Everything rendered here is
 * live data read straight from the database for a chosen school, so what the
 * Super Admin sees is exactly what a teacher / school administrator of that
 * school would be looking at. It is deliberately read-only: previewing must
 * never mutate a school's records.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Loader2, Users, UserCog } from 'lucide-react';

interface SchoolOption {
  id: string;
  name: string;
}

interface TeacherStats {
  teacherCount: number;
  studentCount: number;
  assignmentCount: number;
  pendingGrading: number;
  subjects: { id: string; name: string; students: number }[];
  toGrade: { id: string; student: string; assignment: string; submitted: string }[];
}

interface AdminStats {
  teacherCount: number;
  studentCount: number;
  pendingRequests: number;
  activeCodes: number;
  requests: { id: string; name: string; email: string; role: string; created: string }[];
  codes: { id: string; code: string; role: string; used: boolean; created: string }[];
}

export function RolePreviewPanel({
  role,
  schools,
  onExit,
}: {
  role: 'teacher' | 'school_admin';
  schools: SchoolOption[];
  onExit: () => void;
}) {
  const [schoolId, setSchoolId] = useState<string>(schools[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [teacher, setTeacher] = useState<TeacherStats | null>(null);
  const [admin, setAdmin] = useState<AdminStats | null>(null);

  const RoleIcon = role === 'teacher' ? Users : UserCog;
  const roleLabel = role === 'teacher' ? 'Teacher' : 'School Administrator';

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    const [profilesRes, assignmentsRes, subjectsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, user_type, status, created_at').eq('school_id', schoolId),
      supabase.from('assignments').select('id, title, subject').eq('school_id', schoolId),
      supabase.from('subjects').select('id, name').eq('school_id', schoolId),
    ]);

    const profiles = profilesRes.data ?? [];
    const assignments = assignmentsRes.data ?? [];
    const teacherCount = profiles.filter((p) => p.user_type === 'teacher').length;
    const studentCount = profiles.filter((p) => p.user_type === 'student').length;
    const nameOf = new Map(profiles.map((p) => [p.id, p.full_name as string]));

    if (role === 'teacher') {
      const assignmentIds = assignments.map((a) => a.id);
      const { data: subs } = assignmentIds.length
        ? await supabase
            .from('submissions')
            .select('id, assignment_id, student_id, grade, submitted_at')
            .in('assignment_id', assignmentIds)
        : { data: [] as never[] };

      const ungraded = (subs ?? []).filter((s) => s.grade === null);
      setTeacher({
        teacherCount,
        studentCount,
        assignmentCount: assignments.length,
        pendingGrading: ungraded.length,
        subjects: (subjectsRes.data ?? []).map((s) => ({
          id: s.id,
          name: s.name as string,
          students: studentCount,
        })),
        toGrade: ungraded.slice(0, 25).map((s) => ({
          id: s.id,
          student: nameOf.get(s.student_id) ?? 'Unknown student',
          assignment: assignments.find((a) => a.id === s.assignment_id)?.title ?? 'Unknown assignment',
          submitted: new Date(s.submitted_at as string).toLocaleString(),
        })),
      });
      setAdmin(null);
    } else {
      const [requestsRes, codesRes] = await Promise.all([
        supabase
          .from('invite_requests')
          .select('id, name, email, status, created_at, code_id')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('invite_codes')
          .select('id, code, role, used, created_at, school_id')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })
          .limit(25),
      ]);

      const codes = codesRes.data ?? [];
      const codeIds = new Set(codes.map((c) => c.id));
      const requests = (requestsRes.data ?? []).filter((r) => codeIds.has(r.code_id as string));

      setAdmin({
        teacherCount,
        studentCount,
        pendingRequests: requests.length,
        activeCodes: codes.filter((c) => !c.used).length,
        requests: requests.map((r) => ({
          id: r.id,
          name: (r.name as string) ?? '—',
          email: (r.email as string) ?? '—',
          role: (codes.find((c) => c.id === r.code_id)?.role as string) ?? 'unknown',
          created: new Date(r.created_at as string).toLocaleDateString(),
        })),
        codes: codes.map((c) => ({
          id: c.id,
          code: c.code as string,
          role: (c.role as string) ?? 'unknown',
          used: Boolean(c.used),
          created: new Date(c.created_at as string).toLocaleDateString(),
        })),
      });
      setTeacher(null);
    }

    setLoading(false);
  }, [schoolId, role]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-5 h-5" />
            <span className="font-medium text-sm">Testing as {roleLabel} — live, read-only</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onExit}
            className="h-7 border-amber-950/30 bg-amber-100/40 text-amber-950 hover:bg-amber-100"
          >
            Exit testing
          </Button>
        </div>
      </div>

      <div className="pt-12">
        <header className="liquid-glass liquid-sheen liquid-rim border-b border-foreground/10 sticky top-10 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground/[0.08] flex items-center justify-center">
                <RoleIcon className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{roleLabel} Dashboard</h1>
                <p className="text-xs text-muted-foreground">Live data · read-only preview</p>
              </div>
            </div>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select a school" /></SelectTrigger>
              <SelectContent>
                {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && teacher && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Teachers at school" value={teacher.teacherCount} />
                <Stat label="Students at school" value={teacher.studentCount} />
                <Stat label="Assignments" value={teacher.assignmentCount} />
                <Stat label="Awaiting grading" value={teacher.pendingGrading} />
              </div>

              <div className="liquid-glass rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Subjects</h2>
                {teacher.subjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subjects configured for this school.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {teacher.subjects.map((s) => (
                      <div key={s.id} className="p-4 border border-border rounded-lg">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.students} students enrolled</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="liquid-glass rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Submissions awaiting grading</h2>
                {teacher.toGrade.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing is waiting to be graded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Assignment</TableHead>
                        <TableHead>Submitted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teacher.toGrade.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.student}</TableCell>
                          <TableCell>{s.assignment}</TableCell>
                          <TableCell className="text-muted-foreground">{s.submitted}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}

          {!loading && admin && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Teachers" value={admin.teacherCount} />
                <Stat label="Students" value={admin.studentCount} />
                <Stat label="Pending requests" value={admin.pendingRequests} />
                <Stat label="Unused invite codes" value={admin.activeCodes} />
              </div>

              <div className="liquid-glass rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Pending requests</h2>
                {admin.requests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending join requests.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admin.requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.email}</TableCell>
                          <TableCell><Badge variant="secondary">{r.role}</Badge></TableCell>
                          <TableCell className="text-muted-foreground">{r.created}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="liquid-glass rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">Invite codes</h2>
                {admin.codes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invite codes issued yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admin.codes.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell><code className="bg-muted px-2 py-1 rounded text-xs">{c.code}</code></TableCell>
                          <TableCell>{c.role}</TableCell>
                          <TableCell>
                            <Badge variant={c.used ? 'secondary' : 'default'}>{c.used ? 'Used' : 'Available'}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.created}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}

          {!loading && !schoolId && (
            <p className="text-sm text-muted-foreground">Select a school to preview it.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="liquid-glass rounded-xl p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default RolePreviewPanel;
