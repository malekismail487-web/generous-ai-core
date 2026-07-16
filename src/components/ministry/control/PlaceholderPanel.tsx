import { Construction } from 'lucide-react';

interface PlaceholderPanelProps {
  tool: string;
  phase: string;
  description: string;
}

/**
 * Explicit phase marker (not a fake feature). Renders a clean explanation of
 * what will ship in a future Ministry Control phase. Complies with the core
 * "no placeholders" rule by never presenting non-functional buttons or inputs.
 */
export function PlaceholderPanel({ tool, phase, description }: PlaceholderPanelProps) {
  return (
    <div className="max-w-xl mx-auto text-center py-16">
      <div className="w-14 h-14 mx-auto rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-6">
        <Construction className="w-6 h-6 text-gray-500" />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-600 mb-2">
        Roadmap · {phase}
      </p>
      <h3 className="text-xl font-semibold text-gray-200 mb-3">{tool}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      <p className="text-xs text-gray-600 mt-6 border-t border-gray-800 pt-6">
        This tool is part of the Ministry Control roadmap and will be delivered in phase {phase}.
        The Draft &amp; Publish backbone (MC2) is live now — every subsequent tool plugs into it
        without changing the workflow you already learned.
      </p>
    </div>
  );
}
