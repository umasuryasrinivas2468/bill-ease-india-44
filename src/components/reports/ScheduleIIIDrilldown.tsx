import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { fetchScheduleIIIDrilldown, DrilldownResult } from '@/services/financialStatementsService';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineCode: string | null;
  periodStart?: string;
  periodEnd?: string;
}

const formatINR = (n: number) => {
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};

const sourceLinkFor = (sourceType: string | null, sourceId: string | null): string | null => {
  if (!sourceType || !sourceId) return null;
  switch (sourceType) {
    case 'invoice':            return `/invoices?id=${sourceId}`;
    case 'bill':
    case 'purchase_bill':      return `/expenses?bill=${sourceId}`;
    case 'expense':            return `/expenses?id=${sourceId}`;
    case 'payment':
    case 'payment_received':   return `/payments?id=${sourceId}`;
    case 'asset_purchase':
    case 'depreciation':
    case 'asset_disposal':     return `/assets?id=${sourceId}`;
    case 'manual':             return `/accounting/manual-journals`;
    default:                   return null;
  }
};

const ScheduleIIIDrilldown: React.FC<Props> = ({ open, onOpenChange, lineCode, periodStart, periodEnd }) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [data, setData] = useState<DrilldownResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user?.id || !lineCode) return;
    setLoading(true);
    fetchScheduleIIIDrilldown(user.id, lineCode, { periodStart, periodEnd })
      .then(setData)
      .finally(() => setLoading(false));
  }, [open, user?.id, lineCode, periodStart, periodEnd]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="border-b p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                <span>{data?.label ?? 'Loading…'}</span>
                {data?.line_code && <Badge variant="outline" className="text-[10px]">{data.line_code}</Badge>}
                {data?.note_no && <Badge variant="secondary" className="text-[10px]">Note {data.note_no}</Badge>}
              </SheetTitle>
              <SheetDescription className="mt-1">
                {data?.section ?? ''}{data?.subsection ? ` · ${data.subsection}` : ''}
                {data && (
                  <> · {data.row_count} journal {data.row_count === 1 ? 'line' : 'lines'} · Net ₹ {formatINR(data.net_amount)}</>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6">
            {loading && !data ? (
              <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading journal entries…
              </div>
            ) : !data || data.row_count === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-50" />
                <p>No journal entries posted to this line in the selected period.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Date</th>
                      <th className="px-2 py-2 text-left font-medium">Journal #</th>
                      <th className="px-2 py-2 text-left font-medium">Account</th>
                      <th className="px-2 py-2 text-right font-medium">Debit</th>
                      <th className="px-2 py-2 text-right font-medium">Credit</th>
                      <th className="px-2 py-2 text-left font-medium hidden md:table-cell">Narration</th>
                      <th className="px-2 py-2 text-center font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => {
                      const link = sourceLinkFor(e.source_type, e.source_id);
                      return (
                        <tr key={`${e.journal_id}-${e.account_id}`} className="border-t hover:bg-muted/30">
                          <td className="px-2 py-1.5 whitespace-nowrap">{new Date(e.journal_date).toLocaleDateString('en-IN')}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap font-mono text-[12px]">{e.journal_number}</td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{e.account_name}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{e.account_code}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                            {e.debit > 0 ? formatINR(e.debit) : ''}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                            {e.credit > 0 ? formatINR(e.credit) : ''}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground text-xs max-w-[240px] truncate hidden md:table-cell" title={e.narration || ''}>
                            {e.narration || ''}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {link ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => { navigate(link); onOpenChange(false); }}
                                title={e.source_type || ''}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{e.source_type || '—'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t">
                      <td colSpan={3} className="px-2 py-2 text-right">Total</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">₹ {formatINR(data.debit_total)}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">₹ {formatINR(data.credit_total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default ScheduleIIIDrilldown;
