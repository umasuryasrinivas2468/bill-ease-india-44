import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, Lock, Loader2 } from 'lucide-react';
import { closeFinancialYear, FYCloseResult } from '@/services/financialStatementsService';
import { toast } from 'sonner';

interface Props {
  financialYear: string;
  onClosed?: () => void;
}

const formatINR = (n: number | undefined) =>
  n === undefined || n === null ? '—' : Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const FYCloseButton: React.FC<Props> = ({ financialYear, onClosed }) => {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FYCloseResult | null>(null);

  const run = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const r = await closeFinancialYear(user.id, financialYear);
      setResult(r);
      if (r.closed) {
        toast.success(`FY ${financialYear} closed · journal ${r.journal_number}`);
        onClosed?.();
      } else if (r.already_closed) {
        toast.info(`FY ${financialYear} is already closed`);
      } else {
        toast.warning(r.reason ?? 'Nothing to close.');
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to close FY');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger asChild>
        <Button>
          <Lock className="h-4 w-4 mr-1.5" />
          Close FY {financialYear}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Close Financial Year {financialYear}?
          </DialogTitle>
          <DialogDescription>
            This will post a year-end closing journal that transfers all Income & Expense balances to
            Reserves & Surplus, and lock the period through {financialYear.split('-')[0]}-03-31 +1 (FY end).
            After closing, you cannot post or modify journals dated in this period without first unlocking.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
            {result.closed || result.already_closed ? (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  {result.already_closed ? 'Already closed.' : 'FY closed successfully.'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{result.reason}</span>
              </div>
            )}
            {result.closed && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Income:</span> ₹ {formatINR(result.income_total)}</div>
                <div><span className="text-muted-foreground">Expense:</span> ₹ {formatINR(result.expense_total)}</div>
                <div className="col-span-2"><span className="text-muted-foreground">PAT:</span>
                  <strong className={result.pat && result.pat >= 0 ? 'text-emerald-600 ml-2' : 'text-red-600 ml-2'}>
                    ₹ {formatINR(result.pat)}
                  </strong>
                </div>
                {result.journal_number && (
                  <div className="col-span-2 font-mono text-[11px]"><span className="text-muted-foreground">Journal:</span> {result.journal_number}</div>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={run} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}
              Confirm & close FY
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FYCloseButton;
