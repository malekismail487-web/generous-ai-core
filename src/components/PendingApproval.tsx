import { Clock, School, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSchool } from '@/hooks/useSchool';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr } from '@/lib/translations';

export function PendingApproval() {
  const { profile, school, refresh } = useSchool();
  const { signOut } = useAuth();
  const { language } = useThemeLanguage();

  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="ambient-glow" />
        <div className="w-full max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-red-500 to-rose-600">
            <School className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{tr('registrationDeclined', language)}</h1>
          <p className="text-muted-foreground mb-6">
            {language === 'ar' 
              ? `تسجيلك في ${school?.name} ${tr('registrationDeclinedDesc', language)}`
              : `Your registration for ${school?.name} ${tr('registrationDeclinedDesc', language)}`
            }
          </p>
          <Button variant="outline" onClick={() => signOut()} className="gap-2">
            <LogOut size={16} />{tr('signOut', language)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse">
          <Clock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{tr('pendingApproval', language)}</h1>
        <p className="text-muted-foreground mb-2">
          {tr('yourRequestSubmitted', language)} <strong>{school?.name || (language === 'ar' ? 'مدرستك' : 'your school')}</strong> {tr('hasBeenSubmitted', language)}
        </p>
        <p className="text-sm text-muted-foreground mb-6">{tr('adminWillReview', language)}</p>
        <div className="glass-effect rounded-2xl p-5 mb-6 text-left">
          <h3 className="font-semibold mb-3">{tr('yourDetails', language)}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{tr('name', language)}</span><span>{profile?.full_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{tr('type', language)}</span><span className="capitalize">{profile?.user_type}</span></div>
            {profile?.student_teacher_id && <div className="flex justify-between"><span className="text-muted-foreground">{tr('id', language)}</span><span>{profile.student_teacher_id}</span></div>}
            {profile?.grade_level && <div className="flex justify-between"><span className="text-muted-foreground">{tr('grade', language)}</span><span>{profile.grade_level}</span></div>}
            {profile?.department && <div className="flex justify-between"><span className="text-muted-foreground">{tr('department', language)}</span><span>{profile.department}</span></div>}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={refresh} className="flex-1 gap-2"><RefreshCw size={16} />{tr('checkStatus', language)}</Button>
          <Button variant="ghost" onClick={() => signOut()} className="gap-2"><LogOut size={16} />{tr('signOut', language)}</Button>
        </div>
      </div>
    </div>
  );
}
