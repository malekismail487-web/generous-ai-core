import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Loader2, Check } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';
import { supabase } from '@/integrations/supabase/client';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';

type ActiveTenant = {
  id: string;
  slug: string;
  country_name: string;
  country_code: string;
  default_language: string | null;
  supported_languages: string[] | null;
};

// Flag emoji from ISO country code
function flagFor(code: string) {
  if (!code || code.length !== 2) return '🌐';
  const A = 0x1f1e6;
  const cc = code.toUpperCase();
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65) +
         String.fromCodePoint(A + cc.charCodeAt(1) - 65);
}

export default function CountrySelect() {
  const navigate = useNavigate();
  const { language } = useThemeLanguage();
  const isArabic = language === 'ar';

  const [tenants, setTenants] = useState<ActiveTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    sessionStorage.getItem('selected_tenant_id')
  );

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_active_tenants');
      if (!error && Array.isArray(data)) setTenants(data as ActiveTenant[]);
      setLoading(false);
    })();
  }, []);

  const handleSelect = (t: ActiveTenant) => {
    sessionStorage.setItem('selected_tenant_id', t.id);
    sessionStorage.setItem('selected_tenant_slug', t.slug);
    sessionStorage.setItem('selected_tenant_name', t.country_name);
    sessionStorage.setItem('selected_tenant_code', t.country_code);
    setSelectedId(t.id);
    navigate('/auth');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-3xl overflow-hidden mb-5">
            <LuminaLogo size={80} />
          </div>
          <h1 className="text-3xl font-bold gradient-text" style={{ fontFamily: 'Caveat, cursive' }}>
            Lumina
          </h1>
        </div>

        <div className="flex flex-col items-center mb-8">
          <Globe className="w-6 h-6 text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm mb-1">
            {isArabic ? 'اختر دولتك' : 'Select your country'}
          </p>
          <p className="text-xs text-muted-foreground/70 text-center max-w-[280px]">
            {isArabic
              ? 'إذا استخدمت رمز مدرسة من دولة أخرى، سنحدّث اختيارك تلقائيًا.'
              : 'If you use a school code from another country, we will update this automatically.'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="glass-effect rounded-2xl p-6 text-center text-sm text-muted-foreground">
            {isArabic ? 'لا توجد دول متاحة حاليًا.' : 'No countries are available yet.'}
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => {
              const active = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className={`w-full glass-effect rounded-2xl p-5 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center gap-4 ${active ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-muted border border-border/50 text-2xl">
                    {flagFor(t.country_code)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-foreground truncate">{t.country_name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {(t.supported_languages ?? []).join(' · ') || t.default_language || ''}
                    </p>
                  </div>
                  {active && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
