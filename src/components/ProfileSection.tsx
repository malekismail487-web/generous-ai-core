import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, GraduationCap, LogOut, ChevronRight, Building2, Users, School, Loader2, Sun, Moon, Globe, Heart, Copy, Check, Droplet } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useSchool } from '@/hooks/useSchool';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

import { useToast } from '@/hooks/use-toast';
import { tr } from '@/lib/translations';
import { useWallpaper } from '@/hooks/useWallpaper';
import { useLensPreference } from '@/hooks/useLensPreference';
import { supabase } from '@/integrations/supabase/client';
import { EffortSelector } from '@/components/ai/EffortSelector';
import { LearningProfileCard } from '@/components/student/LearningProfileCard';
import { LuminaMemoryViewer } from '@/components/student/LuminaMemoryViewer';
import { cn } from '@/lib/utils';

export function ProfileSection() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const { profile, school, isSchoolAdmin, loading } = useSchool();
  const { theme, language, setTheme, setLanguage, t } = useThemeLanguage();
  const { lensEnabled, setLensEnabled } = useLensPreference();
  
  const { toast } = useToast();
  const tl = (key: Parameters<typeof tr>[0]) => tr(key, language);

  // Parent code for students
  const [parentCode, setParentCode] = useState<string | null>(null);
  
  const userType = profile?.user_type || 'student';
  const isTeacher = userType === 'teacher';
  const isStudent = userType === 'student';

  useEffect(() => {
    if (!user || !isStudent) return;
    const fetchCode = async () => {
      const { data } = await supabase
        .from('parent_invite_codes')
        .select('code')
        .eq('student_id', user.id)
        .eq('used', false)
        .maybeSingle();
      setParentCode((data as any)?.code || null);
    };
    fetchCode();
  }, [user, isStudent]);


  return (
    <div className="flex-1 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className={cn(
            "inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4",
            isSuperAdmin
              ? "bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04]"
              : isTeacher 
                ? "bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04]"
                : "bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04]"
          )}>
            {isSuperAdmin ? (
              <Shield className="w-8 h-8 text-foreground" />
            ) : isTeacher ? (
              <User className="w-8 h-8 text-foreground" />
            ) : (
              <GraduationCap className="w-8 h-8 text-foreground" />
            )}
          </div>
          <h1 className="text-2xl font-bold mb-1">{profile?.full_name || tl('profile')}</h1>
          {user && (
            <p className="text-sm text-muted-foreground">{user.email}</p>
          )}
        </div>

        {/* School Info */}
        {school && (
          <div className="liquid-glass rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent text-foreground">
                <School className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">{school.name}</h3>
                <p className="text-xs text-muted-foreground">{tl('schoolCode')}: {school.code}</p>
              </div>
            </div>
          </div>
        )}

        {/* Role & Details */}
        <div className="liquid-glass rounded-2xl p-5 mb-4">
          <h3 className="font-semibold mb-3">{tl('yourDetails')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tl('role')}</span>
              <span className="capitalize">
                {isSuperAdmin ? 'Super Admin' : isSchoolAdmin ? 'School Admin' : profile?.user_type || 'Student'}
              </span>
            </div>
            {profile?.student_teacher_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span>{profile.student_teacher_id}</span>
              </div>
            )}
            {profile?.grade_level && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tl('grade')}</span>
                <span>{profile.grade_level}</span>
              </div>
            )}
            {profile?.department && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tl('department')}</span>
                <span>{profile.department}</span>
              </div>
            )}
          </div>
        </div>

        {/* Parent Invite Code for Students */}
        {isStudent && parentCode && (
          <div className="liquid-glass rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04]">
                <Heart className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">{t('Parent Access Code', 'رمز ولي الأمر')}</h3>
                <p className="text-xs text-muted-foreground">{t('Share this code with your parent', 'شارك هذا الرمز مع ولي أمرك')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-widest flex-1">{parentCode}</span>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(parentCode); toast({ title: '✅ Copied!' }); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* School Admin Panel */}
        {isSchoolAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="w-full liquid-glass rounded-2xl p-5 mb-4 text-left hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{tl('schoolAdmin')}</h3>
                <p className="text-sm text-muted-foreground">{tl('manageRegistrations')}</p>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
        )}

        {/* Super Admin Panel */}
        {isSuperAdmin && (
          <button
            onClick={() => navigate('/super-admin')}
            className="w-full liquid-glass rounded-2xl p-5 mb-4 text-left hover:shadow-lg transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-foreground/[0.14] to-foreground/[0.04] text-foreground">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">{tl('manageSchools')}</h3>
                <p className="text-sm text-muted-foreground">{tl('createManageSchools')}</p>
              </div>
              <ChevronRight className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </button>
        )}

        {/* Appearance */}
        <div className="liquid-glass rounded-2xl p-5 mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            {t('Appearance', 'المظهر')}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border",
                theme === 'light'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 text-muted-foreground border-foreground/10 hover:border-primary/30"
              )}
            >
              <Sun size={16} />
              {t('Light', 'فاتح')}
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all border",
                theme === 'dark'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 text-muted-foreground border-foreground/10 hover:border-primary/30"
              )}
            >
              <Moon size={16} />
              {t('Dark', 'داكن')}
            </button>
          </div>
        </div>

        {/* AI effort — the workspace-wide default for every Lumina surface */}
        <div className="liquid-glass rounded-2xl p-5 mb-4">
          <EffortSelector variant="panel" />
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              'This is your default everywhere. Any AI screen can be turned up or down on its own.',
              'هذا هو الإعداد الافتراضي في كل مكان. يمكن تغيير أي شاشة ذكاء اصطناعي بشكل منفصل.',
            )}
          </p>
        </div>

        {/* Liquid lens — the draggable glass oval */}
        <div className="liquid-glass rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold flex items-center gap-2">
                <Droplet size={16} />
                {t('Liquid lens', 'العدسة السائلة')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  'The draggable glass oval with quick shortcuts.',
                  'الشكل البيضاوي الزجاجي القابل للسحب مع الاختصارات السريعة.',
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={lensEnabled}
              aria-label={t('Liquid lens', 'العدسة السائلة')}
              onClick={() => setLensEnabled(!lensEnabled)}
              className={cn(
                'relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300',
                lensEnabled ? 'bg-primary border-primary' : 'bg-secondary/60 border-foreground/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform duration-300',
                  lensEnabled ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        </div>

        {/* Wallpaper */}
        <WallpaperCircleSelector />


        {/* Language */}
        <div className="liquid-glass rounded-2xl p-5 mb-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Globe size={16} />
            {t('Language', 'اللغة')}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-medium transition-all border",
                language === 'en'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 text-muted-foreground border-foreground/10 hover:border-primary/30"
              )}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('ar')}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-medium transition-all border font-arabic",
                language === 'ar'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 text-muted-foreground border-foreground/10 hover:border-primary/30"
              )}
            >
              العربية
            </button>
          </div>
        </div>


        {/* Lumina's Brain (Memory + Knowledge Gaps) */}
        {isStudent && (
          <div className="mb-4">
            <LuminaMemoryViewer />
          </div>
        )}

        {/* Learning Profile */}
        <div className="mb-4">
          <LearningProfileCard />
        </div>

        {/* Sign Out */}
        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut size={16} />
          {t('Sign Out', 'تسجيل الخروج')}
        </Button>
      </div>
    </div>
  );
}

function WallpaperCircleSelector() {
  const { wallpaperId, setWallpaper, presets } = useWallpaper();
  const { theme, t } = useThemeLanguage();

  const currentPresets = presets.filter(p => p.category === theme);

  return (
    <div className="liquid-glass rounded-2xl p-5 mb-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <LuminaLogo size={16} />
        {t('Wallpaper', 'الخلفية')}
      </h3>
      <div className="flex flex-wrap gap-3 justify-center">
        {currentPresets.map((preset) => {
          const isActive = wallpaperId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setWallpaper(preset.id)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-full transition-all duration-200 flex items-center justify-center border-2 shadow-md",
                  isActive
                    ? "scale-110 border-primary ring-2 ring-primary/30"
                    : "border-transparent hover:scale-105 hover:shadow-lg"
                )}
                style={{
                  background: preset.preview,
                }}
              >
                {isActive && (
                  <Check className="w-5 h-5 text-foreground drop-shadow-md" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium max-w-[60px] text-center leading-tight truncate",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
