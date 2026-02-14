import { User, School, GraduationCap } from 'lucide-react';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { tr, getGradeName } from '@/lib/translations';

export function UserProfileBadge() {
  const { profile, school } = useRoleGuard();
  const { language } = useThemeLanguage();

  if (!profile) return null;

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getUserTypeLabel = () => {
    switch (profile.user_type) {
      case 'teacher': return tr('teacher', language);
      case 'student': return tr('student', language);
      case 'school_admin': return tr('schoolAdmin', language);
      default: return profile.user_type;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{getInitials(profile.full_name)}</AvatarFallback>
          </Avatar>
          {profile.grade_level && (
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">{getGradeName(profile.grade_level, language)}</Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">{getInitials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{profile.full_name}</h3>
              <Badge variant="secondary" className="text-xs mt-1">{getUserTypeLabel()}</Badge>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {school && (
            <div className="flex items-center gap-3 text-sm">
              <School size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{school.name}</p>
                <p className="text-xs text-muted-foreground">{tr('school', language)}</p>
              </div>
            </div>
          )}
          {profile.grade_level && (
            <div className="flex items-center gap-3 text-sm">
              <GraduationCap size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{getGradeName(profile.grade_level, language)}</p>
                <p className="text-xs text-muted-foreground">{tr('gradeLevel', language)}</p>
              </div>
            </div>
          )}
          {profile.department && (
            <div className="flex items-center gap-3 text-sm">
              <User size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{profile.department}</p>
                <p className="text-xs text-muted-foreground">{tr('department', language)}</p>
              </div>
            </div>
          )}
          {profile.student_teacher_id && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-4 h-4 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">#</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{profile.student_teacher_id}</p>
                <p className="text-xs text-muted-foreground">{tr('idNumber', language)}</p>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
