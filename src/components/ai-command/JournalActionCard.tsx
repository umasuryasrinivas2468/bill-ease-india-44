import React, { useState } from 'react';
import {
  Sparkles, CheckCircle2, AlertTriangle, ShieldAlert, Undo2, X, Loader2,
  ArrowDownToLine, FileText, TrendingUp, TrendingDown, IndianRupee,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AIJournalAction } from '@/types/aiJournalAction';
import { summariseImpact } from '@/services/shadowPostingService';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Math.abs(Number(n) || 0));

interface JournalActionCardProps {
  action: AIJournalAction;
  onExecute: () => void;
  onCancel: () => void;
  onUndo: () => void;
}

export const JournalActionCard: React.FC<JournalActionCardProps> = ({
  action, onExecute, onCancel, onUndo,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const { proposal, validation, impact, confidence, explanation, status, error, reversal } = action;

  const confidencePct = Math.round(confidence * 100);
  const confidenceTone =
    confidence >= 0.85 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30'
    : confidence >= 0.5 ? 'text-amber-600 bg-amber-500/10 border-amber-500/30'
    : 'text-red-600 bg-red-500/10 border-red-500/30';

  // ── post-execution states ───────────────────────────────────────────────
  if (status === 'posted' && reversal && !reversal.reversed) {
    return (
      <div className="flex gap-3 justify-start">
        <div className="h-8 w-8 shrink-0 rounded-full bg-emerald-500 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-white" />
        </div>
        <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-emerald-500/5 border border-emerald-500/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Posted ✓</div>
              <div className="text-xs text-muted-foreground mt-0.5">{proposal.narration}</div>
              <div className="text-xs text-muted-foreground">{summariseImpact(impact)}</div>
            </div>
            <Button size="sm" variant="outline" onClick={onUndo} className="shrink-0">
              <Undo2 className="h-3 w-3 mr-1.5" />Undo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'reversed') {
    return (
      <div className="flex gap-3 justify-start">
        <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
          <Undo2 className="h-4 w-4" />
        </div>
        <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-muted/60">
          <div className="font-medium">Reversed</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            The paired reversal journal has been posted. Books are back to where they were.
          </div>
        </div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="flex gap-3 justify-start">
        <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
          <X className="h-4 w-4" />
        </div>
        <div className="max-w-[80%] rounded-2xl px-4 py-3 text-xs text-muted-foreground bg-muted/40">
          Action cancelled — nothing was posted.
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex gap-3 justify-start">
        <div className="h-8 w-8 shrink-0 rounded-full bg-red-500 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-white" />
        </div>
        <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-red-500/5 border border-red-500/30">
          <div className="font-medium text-red-700 dark:text-red-300">Posting failed</div>
          <div className="text-xs text-muted-foreground mt-0.5">{error || 'Unknown error.'}</div>
        </div>
      </div>
    );
  }

  // ── pre-execution preview ───────────────────────────────────────────────
  const refuse = !validation.ok || confidence < 0.5;

  return (
    <div className="flex gap-3 justify-start">
      <div className="h-8 w-8 shrink-0 rounded-full bg-primary flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="max-w-[92%] flex-1 rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">Journal preview</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground capitalize">{proposal.source_type.replace('_', ' ')}</span>
          </div>
          <div className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', confidenceTone)}>
            {confidencePct}% confidence
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="text-sm">{explanation}</div>

          {validation.errors.length > 0 && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300 mb-1">
                <ShieldAlert className="h-3.5 w-3.5" />Validation failed
              </div>
              <ul className="list-disc list-inside text-red-600 dark:text-red-200 space-y-0.5">
                {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {action.id && (
            <div className="rounded-md border bg-background overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Account</th>
                    <th className="text-right px-3 py-1.5 font-medium w-24">Debit</th>
                    <th className="text-right px-3 py-1.5 font-medium w-24">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.lines.map((l, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{l.account_name || '(unknown)'}</div>
                        {l.account_code && <div className="text-[10px] text-muted-foreground font-mono">{l.account_code} • {l.account_type}</div>}
                        {l.line_narration && <div className="text-[10px] text-muted-foreground italic">{l.line_narration}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.debit > 0 ? inr(l.debit) : ''}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.credit > 0 ? inr(l.credit) : ''}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-3 py-1.5">Total</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(validation.totalDebit)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(validation.totalCredit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Impact strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            {Math.abs(impact.cashDelta) > 0.01 && (
              <ImpactPill icon={<IndianRupee className="h-3 w-3" />} label="Cash" delta={impact.cashDelta} />
            )}
            {Math.abs(impact.arDelta) > 0.01 && (
              <ImpactPill icon={<ArrowDownToLine className="h-3 w-3" />} label="AR" delta={impact.arDelta} />
            )}
            {Math.abs(impact.apDelta) > 0.01 && (
              <ImpactPill icon={<ArrowDownToLine className="h-3 w-3 rotate-180" />} label="AP" delta={impact.apDelta} />
            )}
            {Math.abs(impact.pl.profitDelta) > 0.01 && (
              <ImpactPill
                icon={impact.pl.profitDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                label="Profit" delta={impact.pl.profitDelta}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {showDetails ? 'Hide' : 'Show'} balance-sheet impact
          </button>

          {showDetails && (
            <div className="rounded-md border bg-muted/20 p-2.5 text-[11px] space-y-1">
              <Row label="Assets" delta={impact.bs.assetsDelta} />
              <Row label="Liabilities" delta={impact.bs.liabilitiesDelta} />
              <Row label="Equity" delta={impact.bs.equityDelta} />
              <Row label="Income" delta={impact.pl.incomeDelta} />
              <Row label="Expense" delta={impact.pl.expenseDelta} />
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t bg-muted/20 flex items-center justify-between gap-2">
          {refuse ? (
            <>
              <div className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {validation.ok ? 'Confidence too low — please rephrase.' : 'Cannot execute — fix the issues above first.'}
              </div>
              <Button size="sm" variant="ghost" onClick={onCancel}>Dismiss</Button>
            </>
          ) : status === 'executing' ? (
            <>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Posting…
              </div>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
              <Button size="sm" onClick={onExecute}>Execute & post journal</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ImpactPill: React.FC<{ icon: React.ReactNode; label: string; delta: number }> = ({ icon, label, delta }) => {
  const positive = delta >= 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
      positive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    )}>
      {icon}
      {label} {positive ? '+' : '−'}{inr(delta)}
    </span>
  );
};

const Row: React.FC<{ label: string; delta: number }> = ({ label, delta }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('font-medium tabular-nums', delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
      {delta >= 0 ? '+' : '−'}{inr(delta)}
    </span>
  </div>
);

export default JournalActionCard;
