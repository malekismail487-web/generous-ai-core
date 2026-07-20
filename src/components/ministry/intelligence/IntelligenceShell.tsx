import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Globe2, MapPin, School, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type View = 'national' | 'regional' | 'school';

interface NationalOverview {
  tenant_id: string;
  window_days: number;
  totals_by_event: Record<string, number>;
  active_schools: number;
  active_regions: number;
  daily_activity: { day: string; events: number }[];
}

interface RegionRow {
  region_id: string;
  region_name: string;
  event_count: number;
  school_count: number;
}

interface SchoolSnapshot {
  school_id: string;
  window_days: number;
  totals_by_event: Record<string, number>;
  by_subject: { subject_id: string; events: number }[];
}

interface InsightRow {
  id: string;
  scope: 'national' | 'regional' | 'school';
  school_id: string | null;
  region_id: string | null;
  subject_id: string | null;
  severity: 'info' | 'watch' | 'concern' | 'urgent';
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
  acknowledged_at: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  homework_submission: 'Homework submissions',
  exam_submission: 'Exam submissions',
  material_view: 'Material views',
  lesson_event: 'Lesson events',
  tutor_interaction: 'Tutor interactions',
  lecture_generated: 'Lectures generated',
  material_uploaded: 'Materials uploaded',
};

const SEVERITY_STYLE: Record<InsightRow['severity'], string> = {
  info: 'border-gray-800 text-gray-300 bg-gray-900/40',
  watch: 'border-amber-900/60 text-amber-300 bg-amber-950/30',
  concern: 'border-orange-900/60 text-orange-300 bg-orange-950/30',
  urgent: 'border-red-900/60 text-red-300 bg-red-950/30',
};

export function IntelligenceShell() {
  const token = typeof window === 'undefined' ? null : sessionStorage.getItem('ministry_session_token');
  const [view, setView] = useState<View>('national');
  const [days, setDays] = useState<number>(30);

  const [national, setNational] = useState<NationalOverview | null>(null);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [schoolList, setSchoolList] = useState<{ id: string; name: string }[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [schoolSnap, setSchoolSnap] = useState<SchoolSnapshot | null>(null);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [nat, reg, ins] = await Promise.all([
        supabase.rpc('mi_national_overview', { p_session_token: token, p_days: days }),
        supabase.rpc('mi_regional_breakdown', { p_session_token: token, p_days: days }),
        supabase.rpc('mi_list_insights', { p_session_token: token, p_limit: 25 }),
      ]);
      if (nat.error) throw nat.error;
      if (reg.error) throw reg.error;
      if (ins.error) throw ins.error;
      setNational(nat.data as unknown as NationalOverview);
      setRegions((reg.data as unknown as RegionRow[]) ?? []);
      setInsights((ins.data as unknown as InsightRow[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load intelligence data');
    } finally {
      setLoading(false);
    }
  };

  // Lightweight school list — reads schools directly, tenant-scoped by RLS
  // via the ministry_sessions layer (schools table is scoped to tenant already).
  const loadSchoolList = async () => {
    if (!token) return;
    const { data } = await supabase
      .from('schools')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(200);
    setSchoolList((data as { id: string; name: string }[]) ?? []);
  };

  const loadSchoolSnapshot = async (id: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('mi_school_snapshot', {
        p_session_token: token,
        p_school_id: id,
        p_days: days,
      });
      if (err) throw err;
      setSchoolSnap(data as unknown as SchoolSnapshot);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load school snapshot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);
  useEffect(() => { void loadSchoolList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (selectedSchool) void loadSchoolSnapshot(selectedSchool); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedSchool, days]);

  if (!token) {
    return <div className="text-sm text-gray-500">Ministry session required.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-emerald-300">National Intelligence</h2>
          <p className="text-xs text-gray-500">
            Aggregated, PII-free educational activity across your tenant. No teacher evaluation. No student identification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-black border border-gray-800 text-gray-300 text-xs px-2 py-1.5 rounded"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1 text-xs">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* View switch */}
      <div className="flex gap-1 border-b border-gray-900">
        {([
          { id: 'national', label: 'National', icon: Globe2 },
          { id: 'regional', label: 'Regional', icon: MapPin },
          { id: 'school',   label: 'School',   icon: School },
        ] as const).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors ${
              view === v.id ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <v.icon className="w-4 h-4" />
            {v.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-400 border border-red-900/60 bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      )}

      {/* National view */}
      {view === 'national' && national && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active schools" value={national.active_schools} />
            <StatCard label="Active regions" value={national.active_regions} />
            <StatCard
              label="Total signal (events)"
              value={Object.values(national.totals_by_event ?? {}).reduce((s, n) => s + Number(n || 0), 0)}
            />
            <StatCard label="Window" value={`${national.window_days}d`} />
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Totals by event</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(national.totals_by_event ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border border-gray-900 px-3 py-2 rounded bg-black/60">
                  <span className="text-sm text-gray-300">{EVENT_LABELS[k] ?? k}</span>
                  <span className="text-sm font-mono text-emerald-300">{Number(v).toLocaleString()}</span>
                </div>
              ))}
              {Object.keys(national.totals_by_event ?? {}).length === 0 && (
                <div className="text-xs text-gray-600 italic">No activity in this window yet. The nightly aggregator runs at 02:15 UTC.</div>
              )}
            </div>
          </div>

          <ActivitySparkline series={national.daily_activity ?? []} />
        </div>
      )}

      {/* Regional view */}
      {view === 'regional' && (
        <div className="space-y-2">
          {regions.length === 0 && (
            <div className="text-xs text-gray-600 italic">No regional rollups yet.</div>
          )}
          {regions.map((r) => (
            <div key={r.region_id} className="flex items-center justify-between border border-gray-900 px-3 py-2 rounded bg-black/60">
              <div className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-emerald-500" />
                <span className="text-sm text-gray-200">{r.region_name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-gray-500">{r.school_count} schools</span>
                <span className="font-mono text-emerald-300">{Number(r.event_count).toLocaleString()} events</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* School view */}
      {view === 'school' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide">Pick a school</label>
            <select
              className="w-full mt-1 bg-black border border-gray-800 text-gray-300 text-sm px-3 py-2 rounded"
              value={selectedSchool ?? ''}
              onChange={(e) => setSelectedSchool(e.target.value || null)}
            >
              <option value="">Select…</option>
              {schoolList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {schoolSnap && selectedSchool && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Totals by event</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(schoolSnap.totals_by_event ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border border-gray-900 px-3 py-2 rounded bg-black/60">
                      <span className="text-sm text-gray-300">{EVENT_LABELS[k] ?? k}</span>
                      <span className="text-sm font-mono text-emerald-300">{Number(v).toLocaleString()}</span>
                    </div>
                  ))}
                  {Object.keys(schoolSnap.totals_by_event ?? {}).length === 0 && (
                    <div className="text-xs text-gray-600 italic">No activity for this school in the window.</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Top subjects</div>
                <div className="space-y-1">
                  {(schoolSnap.by_subject ?? []).slice(0, 8).map((s) => (
                    <div key={s.subject_id} className="flex items-center justify-between text-xs border border-gray-900 px-3 py-1.5 rounded bg-black/60">
                      <span className="text-gray-400 font-mono truncate">{s.subject_id}</span>
                      <span className="font-mono text-emerald-300">{Number(s.events).toLocaleString()}</span>
                    </div>
                  ))}
                  {(schoolSnap.by_subject ?? []).length === 0 && (
                    <div className="text-xs text-gray-600 italic">No subject-tagged activity yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights strip — always visible */}
      <div className="border-t border-gray-900 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-300">Insights</h3>
          <span className="text-[10px] text-gray-600">Evidence-based, tenant-scoped. No teacher evaluation.</span>
        </div>
        {insights.length === 0 ? (
          <div className="text-xs text-gray-600 italic">
            No insights recorded yet. The MI4 alerts and MI5 recommendation engines will write here once shipped.
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((i) => (
              <div key={i.id} className={`border px-3 py-2 rounded ${SEVERITY_STYLE[i.severity]}`}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{i.title}</div>
                  <div className="text-[10px] uppercase tracking-wide opacity-70">{i.severity} · {i.scope}</div>
                </div>
                <div className="text-xs opacity-90 mt-1">{i.summary}</div>
                <div className="text-[10px] opacity-60 mt-1">
                  {i.window_start && i.window_end ? `${i.window_start} → ${i.window_end}` : new Date(i.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-gray-900 bg-black/60 rounded p-3">
      <div className="text-[10px] uppercase text-gray-500 tracking-wide">{label}</div>
      <div className="text-2xl font-mono text-emerald-300 mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function ActivitySparkline({ series }: { series: { day: string; events: number }[] }) {
  if (!series.length) return null;
  const max = Math.max(...series.map((s) => Number(s.events) || 0), 1);
  return (
    <div>
      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Daily activity</div>
      <div className="flex items-end gap-0.5 h-24 border border-gray-900 bg-black/60 rounded px-2 py-2">
        {series.map((s) => (
          <div
            key={s.day}
            title={`${s.day}: ${s.events}`}
            className="flex-1 min-w-[2px] bg-emerald-700/70 hover:bg-emerald-500 transition-colors"
            style={{ height: `${(Number(s.events) / max) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
