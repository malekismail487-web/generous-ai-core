import { useState } from 'react';
import { GraduationCap, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';

export function TeacherRequestCard() {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isTeacher, isAdmin, teacherRequest, requestTeacherAccess } = useUserRole();

  // Already a teacher or admin
  if (isTeacher || isAdmin) {
    return (
      <div className="liquid-glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Teacher Access</h3>
            <p className="text-sm text-emerald-500">✓ You have teacher privileges</p>
          </div>
        </div>
      </div>
    );
  }

  // Has pending request
  if (teacherRequest?.status === 'pending') {
    return (
      <div className="liquid-glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Request Pending</h3>
            <p className="text-sm text-muted-foreground">Your teacher access request is under review</p>
          </div>
        </div>
        {teacherRequest.reason && (
          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            "{teacherRequest.reason}"
          </p>
        )}
      </div>
    );
  }

  // Request was rejected
  if (teacherRequest?.status === 'rejected') {
    return (
      <div className="liquid-glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Request Declined</h3>
            <p className="text-sm text-muted-foreground">Your teacher access request was not approved</p>
          </div>
        </div>
        {teacherRequest.admin_notes && (
          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            Admin note: {teacherRequest.admin_notes}
          </p>
        )}
      </div>
    );
  }

  // Request form
  const handleSubmit = async () => {
    setIsSubmitting(true);
    await requestTeacherAccess(reason);
    setIsSubmitting(false);
  };

  return (
    <div className="liquid-glass rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold">Become a Teacher</h3>
          <p className="text-sm text-muted-foreground">Request access to upload course materials</p>
        </div>
      </div>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why do you want teacher access? (optional)"
        rows={3}
        className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-foreground/10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
      />

      <Button 
        className="w-full gap-2" 
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <GraduationCap className="w-4 h-4" />
        )}
        Request Teacher Access
      </Button>
    </div>
  );
}
