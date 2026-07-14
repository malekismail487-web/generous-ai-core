/**
 * TenantsPanel — Super Admin surface for country (tenant) lifecycle.
 *
 * Backed by the T1 RPCs:
 *  - get_active_tenants   (visible pickers)
 *  - provision_tenant     (create hidden + provisioning)
 *  - activate_tenant      (make visible + active)
 *  - suspend_tenant       (hide + suspend)
 *
 * Only the Super Admin can execute the provisioning RPCs; the SELECT on
 * `tenants` for a full row list is also super-admin-only via RLS, which is
 * why we list from the RPC (visible) plus the raw table for management.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe2, Loader2, Plus, Play, Pause } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import TenantDefaultsEditor from '@/components/admin/TenantDefaultsEditor';

interface TenantRow {
  id: string;
  slug: string;
  country_name: string;
  country_code: string;
  ministry_name: string;
  default_language: string;
  supported_languages: string[];
  status: 'active' | 'provisioning' | 'suspended';
  is_visible: boolean;
  created_at: string;
  default_subjects: unknown;
  grading_system: unknown;
  academic_calendar: unknown;
  curriculum_framework: string | null;
}

export default function TenantsPanel() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    country_name: '',
    country_code: '',
    ministry_name: 'Ministry of Education',
    default_language: 'en',
    curriculum_framework: '',
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('country_name');
    if (!error) setTenants((data ?? []) as TenantRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const provision = async () => {
    if (!form.slug || !form.country_name || !form.country_code) {
      toast({ variant: 'destructive', title: 'Slug, country name, and code are required' });
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc('provision_tenant', {
      payload: {
        slug: form.slug,
        country_name: form.country_name,
        country_code: form.country_code,
        ministry_name: form.ministry_name,
        default_language: form.default_language,
        supported_languages: [form.default_language],
        curriculum_framework: form.curriculum_framework || null,
      },
    });
    setCreating(false);
    const result = data as { success: boolean; error?: string } | null;
    if (error || !result?.success) {
      toast({ variant: 'destructive', title: 'Provisioning failed', description: error?.message || result?.error });
      return;
    }
    toast({ title: 'Tenant provisioned', description: `${form.country_name} is hidden until activated.` });
    setForm({ slug: '', country_name: '', country_code: '', ministry_name: 'Ministry of Education', default_language: 'en', curriculum_framework: '' });
    load();
  };

  const activate = async (id: string) => {
    const { error } = await supabase.rpc('activate_tenant', { p_tenant_id: id });
    if (error) { toast({ variant: 'destructive', title: error.message }); return; }
    toast({ title: 'Tenant activated' });
    load();
  };

  const suspend = async (id: string) => {
    if (!confirm('Suspend this country? It will disappear from every picker until reactivated.')) return;
    const { error } = await supabase.rpc('suspend_tenant', { p_tenant_id: id });
    if (error) { toast({ variant: 'destructive', title: error.message }); return; }
    toast({ title: 'Tenant suspended' });
    load();
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4" />
          <h3 className="font-semibold">Provision new country</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="slug (e.g. eg)"        value={form.slug}                 onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
          <Input placeholder="country name"          value={form.country_name}         onChange={(e) => setForm({ ...form, country_name: e.target.value })} />
          <Input placeholder="ISO code (EG)"         value={form.country_code}         onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} />
          <Input placeholder="ministry name"         value={form.ministry_name}        onChange={(e) => setForm({ ...form, ministry_name: e.target.value })} />
          <Input placeholder="default language (en)" value={form.default_language}     onChange={(e) => setForm({ ...form, default_language: e.target.value })} />
          <Input placeholder="curriculum framework"  value={form.curriculum_framework} onChange={(e) => setForm({ ...form, curriculum_framework: e.target.value })} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={provision} disabled={creating}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Provision'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          New tenants start hidden. Users only see a country after you activate it.
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 className="w-4 h-4" />
          <h3 className="font-semibold">Countries</h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : tenants.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No tenants yet.</p>
        ) : (
          <div className="space-y-2">
            {tenants.map((t) => (
              <div key={t.id} className="border border-border/40 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{t.country_name}</span>
                      <Badge variant="outline" className="text-[10px]">{t.country_code}</Badge>
                      <Badge
                        variant={t.status === 'active' ? 'default' : t.status === 'suspended' ? 'destructive' : 'secondary'}
                        className="text-[10px] capitalize"
                      >
                        {t.status}
                      </Badge>
                      {!t.is_visible && <Badge variant="outline" className="text-[10px]">hidden</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.ministry_name} · {t.default_language.toUpperCase()}
                      {t.curriculum_framework ? ` · ${t.curriculum_framework}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.status !== 'active' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => activate(t.id)}>
                        <Play className="w-3 h-3" /> Activate
                      </Button>
                    )}
                    {t.status === 'active' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => suspend(t.id)}>
                        <Pause className="w-3 h-3" /> Suspend
                      </Button>
                    )}
                  </div>
                </div>

                <TenantDefaultsEditor
                  tenantId={t.id}
                  defaults={{
                    default_subjects: t.default_subjects,
                    grading_system: t.grading_system,
                    academic_calendar: t.academic_calendar,
                    default_language: t.default_language,
                    supported_languages: t.supported_languages ?? [],
                    curriculum_framework: t.curriculum_framework,
                  }}
                  onSaved={load}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
