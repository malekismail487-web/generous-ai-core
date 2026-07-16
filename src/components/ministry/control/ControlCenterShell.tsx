import { useEffect, useState } from 'react';
import {
  BookOpen, Building2, ClipboardList, FileText, GitBranch, Globe2,
  History, Megaphone, ScrollText, Settings2, ShieldCheck, ToggleRight,
  Users,
} from 'lucide-react';
import { PublishingPanel } from './PublishingPanel';
import { PermissionsPanel } from './PermissionsPanel';
import { AuditLogPanel } from './AuditLogPanel';
import { PlaceholderPanel } from './PlaceholderPanel';

export type ControlToolId =
  | 'publishing'
  | 'permissions'
  | 'audit'
  | 'curriculum'
  | 'policies'
  | 'schools'
  | 'users'
  | 'regions'
  | 'lumina'
  | 'features'
  | 'communications'
  | 'security';

interface ToolDef {
  id: ControlToolId;
  label: string;
  icon: typeof BookOpen;
  group: 'governance' | 'administration' | 'configuration';
  phase: 'MC2' | 'MC3' | 'MC4' | 'MC5' | 'MC6' | 'MC7' | 'MC8' | 'MC9' | 'MC10' | 'MC11';
  description: string;
}

const TOOLS: ToolDef[] = [
  { id: 'publishing', label: 'Publishing', icon: GitBranch, group: 'governance', phase: 'MC2',
    description: 'Draft → Review → Publish queue for every ministry change.' },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck, group: 'governance', phase: 'MC2',
    description: 'Ministry role assignments and capability matrix.' },
  { id: 'audit', label: 'Audit Log', icon: History, group: 'governance', phase: 'MC2',
    description: 'Immutable record of every ministry action.' },
  { id: 'curriculum', label: 'Curriculum', icon: BookOpen, group: 'administration', phase: 'MC3',
    description: 'Official subjects, curriculum versions, and grade assignment.' },
  { id: 'policies', label: 'Educational Policy', icon: ScrollText, group: 'administration', phase: 'MC4',
    description: 'Grading systems, calendars, promotion & graduation rules.' },
  { id: 'schools', label: 'School Management', icon: Building2, group: 'administration', phase: 'MC5',
    description: 'School lifecycle, approvals, suspensions, archival.' },
  { id: 'users', label: 'User Governance', icon: Users, group: 'administration', phase: 'MC6',
    description: 'Ministry administrators, curriculum officers, teacher visibility.' },
  { id: 'regions', label: 'Regional Structure', icon: Globe2, group: 'administration', phase: 'MC7',
    description: 'Regions, districts, and educational zones.' },
  { id: 'lumina', label: 'Lumina Configuration', icon: Settings2, group: 'configuration', phase: 'MC8',
    description: 'Terminology, explanation style, accessibility. Never reasoning.' },
  { id: 'features', label: 'Feature Management', icon: ToggleRight, group: 'configuration', phase: 'MC9',
    description: 'Per-tenant modules: Disabled / Optional / Required.' },
  { id: 'communications', label: 'National Communication', icon: Megaphone, group: 'configuration', phase: 'MC10',
    description: 'Announcements, curriculum updates, teacher & admin notices.' },
  { id: 'security', label: 'Security & Sessions', icon: FileText, group: 'configuration', phase: 'MC11',
    description: 'Session logs, permission changes, verification status.' },
];

const GROUPS: Record<string, string> = {
  governance: 'Governance',
  administration: 'Administration',
  configuration: 'Configuration',
};

const STORAGE_KEY = 'ministry_control_active_tool';

export function ControlCenterShell() {
  const [active, setActive] = useState<ControlToolId>(() => {
    if (typeof window === 'undefined') return 'publishing';
    return (sessionStorage.getItem(STORAGE_KEY) as ControlToolId) || 'publishing';
  });

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  const activeTool = TOOLS.find((t) => t.id === active) ?? TOOLS[0];
  const grouped = (Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((g) => ({
    key: g,
    label: GROUPS[g],
    tools: TOOLS.filter((t) => t.group === g),
  }));

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-180px)] pb-24">
      {/* Sidebar */}
      <aside className="w-full md:w-64 shrink-0 bg-gray-950 border border-gray-800 rounded-xl p-3 overflow-y-auto">
        <div className="flex items-center gap-2 px-2 py-3 mb-2 border-b border-gray-800">
          <ClipboardList className="w-4 h-4 text-emerald-500" />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Ministry</p>
            <p className="text-sm font-semibold text-gray-200">Control Center</p>
          </div>
        </div>
        {grouped.map((group) => (
          <div key={group.key} className="mb-3">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-600">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                const isActive = tool.id === active;
                return (
                  <button
                    key={tool.id}
                    onClick={() => setActive(tool.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tool.label}</span>
                    {tool.phase !== 'MC2' && (
                      <span className="ml-auto text-[9px] font-mono text-gray-600">{tool.phase}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Content */}
      <section className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <header className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <activeTool.icon className="w-5 h-5 text-emerald-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-100">{activeTool.label}</h2>
              <p className="text-xs text-gray-500">{activeTool.description}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded border border-gray-800 text-gray-500">
            {activeTool.phase}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {active === 'publishing' && <PublishingPanel />}
          {active === 'permissions' && <PermissionsPanel />}
          {active === 'audit' && <AuditLogPanel />}
          {active !== 'publishing' && active !== 'permissions' && active !== 'audit' && (
            <PlaceholderPanel tool={activeTool.label} phase={activeTool.phase} description={activeTool.description} />
          )}
        </div>
      </section>
    </div>
  );
}
