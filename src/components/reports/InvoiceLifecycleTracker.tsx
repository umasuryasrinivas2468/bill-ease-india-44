import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Workflow } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { formatINR } from '@/lib/gst';

const STAGES = [
  'draft','approved','sent','viewed','accepted','part_paid','paid','closed',
] as const;

const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft', approved: 'Approved', sent: 'Sent', viewed: 'Viewed',
  accepted: 'Accepted', part_paid: 'Part Paid', paid: 'Paid', closed: 'Closed',
};

// #2 Lifecycle Tracking Engine — full flow:
// Draft → Approved → Sent → Viewed → Accepted → Part Paid → Paid → Closed
// Shows where revenue gets stuck, with counts and value at each stage.
const InvoiceLifecycleTracker: React.FC = () => {
  const { data: invoices = [] } = useInvoices();

  const buckets = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    STAGES.forEach(s => { map[s] = { count: 0, value: 0 }; });
    invoices.forEach((i: any) => {
      let stage = i.lifecycle_stage as string | undefined;
      if (!stage) {
        // Derive sensible default from existing status when lifecycle is unset
        if (i.status === 'paid') stage = 'paid';
        else if (i.status === 'partial') stage = 'part_paid';
        else stage = 'sent';
      }
      if (!map[stage]) map[stage] = { count: 0, value: 0 };
      map[stage].count += 1;
      map[stage].value += Number(i.total_amount || 0);
    });
    return map;
  }, [invoices]);

  const stuckStage = useMemo(() => {
    let max = { stage: '', value: 0 };
    STAGES.forEach((s) => {
      if (s === 'paid' || s === 'closed') return;
      const v = buckets[s]?.value || 0;
      if (v > max.value) max = { stage: s, value: v };
    });
    return max.stage ? max : null;
  }, [buckets]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Workflow className="h-5 w-5" /> Lifecycle Tracking Engine
        </CardTitle>
        <CardDescription>
          Where does revenue get stuck? Counts and value at each stage of the
          Draft → Closed flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="flex items-stretch gap-2 min-w-max">
            {STAGES.map((s, idx) => {
              const b = buckets[s];
              const isTerminal = s === 'paid' || s === 'closed';
              return (
                <React.Fragment key={s}>
                  <Card className={`min-w-[140px] ${isTerminal ? 'bg-green-50 border-green-200' : ''}`}>
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground">{STAGE_LABEL[s]}</div>
                      <div className="text-lg font-semibold">{b.count}</div>
                      <div className="text-xs">{formatINR(b.value)}</div>
                    </CardContent>
                  </Card>
                  {idx < STAGES.length - 1 && (
                    <div className="self-center"><ChevronRight className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {stuckStage && (
          <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200">
            <Badge variant="secondary" className="mr-2">Bottleneck</Badge>
            <span className="text-sm">
              Most revenue is stuck at <b>{STAGE_LABEL[stuckStage.stage]}</b> — {formatINR(stuckStage.value)}.
              Consider chasing acceptance / approval at this stage.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InvoiceLifecycleTracker;
