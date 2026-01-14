import { cn } from '@/lib/utils';

interface BannerAdProps {
  location: 'home' | 'chat' | 'assignments';
  className?: string;
}

// Ministry-approved static banner ads - non-intrusive, educational content
const bannerContent = {
  home: {
    title: 'Learn Smart, Learn Fast',
    subtitle: 'Ministry of Education Approved',
    icon: '📚',
    color: 'from-blue-500/10 to-indigo-500/10',
    borderColor: 'border-blue-500/20',
  },
  chat: {
    title: 'AI-Powered Learning',
    subtitle: 'Educational Excellence',
    icon: '🎓',
    color: 'from-violet-500/10 to-purple-500/10',
    borderColor: 'border-violet-500/20',
  },
  assignments: {
    title: 'Stay On Track',
    subtitle: 'Complete Your Assignments',
    icon: '✏️',
    color: 'from-emerald-500/10 to-teal-500/10',
    borderColor: 'border-emerald-500/20',
  },
};

export function BannerAd({ location, className }: BannerAdProps) {
  const content = bannerContent[location];

  return (
    <div
      className={cn(
        'w-full px-4 py-2 rounded-lg border',
        `bg-gradient-to-r ${content.color}`,
        content.borderColor,
        'flex items-center justify-center gap-3',
        className
      )}
    >
      <span className="text-lg">{content.icon}</span>
      <div className="text-center">
        <p className="text-xs font-medium text-foreground">{content.title}</p>
        <p className="text-[10px] text-muted-foreground">{content.subtitle}</p>
      </div>
      <span className="text-[8px] text-muted-foreground/50 absolute right-2 top-1">Ad</span>
    </div>
  );
}
