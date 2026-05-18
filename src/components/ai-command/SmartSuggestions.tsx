import React from 'react';
import { Sparkles, Loader2, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SmartSuggestion } from '@/services/aiCommandSuggestionsService';

interface SmartSuggestionsProps {
  suggestions: SmartSuggestion[];
  preview: string;
  loading: boolean;
  disabled?: boolean;
  onSelect: (text: string) => void;
}

const TAG_COLORS: Record<string, string> = {
  Invoice: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  Bill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Expense: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  Payment: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Quote: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  Client: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  Vendor: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  Stock: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30',
  Order: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  Navigate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  Ask: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
};

const tagColor = (tag?: string) =>
  (tag && TAG_COLORS[tag]) || 'bg-muted text-foreground/80 border-border';

export const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  suggestions,
  preview,
  loading,
  disabled,
  onSelect,
}) => {
  const hasSuggestions = suggestions.length > 0;
  if (!hasSuggestions && !preview && !loading) return null;

  return (
    <div className="mb-2 rounded-2xl border bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        <Sparkles className="h-3 w-3 text-orange-500" />
        <span>Smart suggestions</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin ml-auto opacity-60" />}
      </div>

      {preview && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300">
          <ArrowUpRight className="h-3 w-3" />
          <span className="truncate max-w-[420px]">{preview}</span>
        </div>
      )}

      {hasSuggestions && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, idx) => (
            <button
              key={`${idx}-${s.text.slice(0, 16)}`}
              type="button"
              onClick={() => onSelect(s.text)}
              disabled={disabled}
              title={s.reason || s.text}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                'transition-colors duration-150',
                'hover:bg-primary/10 hover:border-primary/40',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {s.tag && (
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                    tagColor(s.tag),
                  )}
                >
                  {s.tag}
                </span>
              )}
              <span className="text-left whitespace-normal max-w-[360px] truncate">
                {s.text}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartSuggestions;
