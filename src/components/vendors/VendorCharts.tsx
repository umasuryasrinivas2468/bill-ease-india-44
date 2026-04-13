import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { PurchaseBillRecord } from '@/pages/PurchaseBills';
import { computeVendorScore } from '@/components/vendors/VendorHealthBadge';

interface VendorChartsProps {
  vendorId: string;
  vendor?: {
    gst_number?: string | null;
    pan?: string | null;
    bank_ifsc?: string | null;
    bank_account_number?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

type MonthlyStat = {
  month: string; // YYYY-MM
  total_amount: number;
  count: number;
};

const VendorCharts: React.FC<VendorChartsProps> = ({ vendorId, vendor }) => {
  const [bills, setBills] = useState<PurchaseBillRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('purchase_bills' as any)
          .select('*')
          .eq('vendor_id', vendorId)
          .order('bill_date', { ascending: true });
        if (error) throw error;
        if (mounted) setBills((data || []) as PurchaseBillRecord[]);
      } catch (err) {
        console.error('VendorCharts fetch error', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [vendorId]);

  const summary = useMemo(() => {
    const totalAmount = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalTax = bills.reduce((s, b) => s + Number(b.gst_amount || 0), 0);
    const totalBills = bills.length;
    const outstanding = bills.filter(b => (b.status || 'pending') !== 'paid').reduce((s, b) => s + Number(b.total_amount || 0), 0);

    // monthly grouping
    const map = new Map<string, MonthlyStat>();
    bills.forEach(b => {
      const month = (b.bill_date || '').slice(0,7) || 'unknown';
      const curr = map.get(month) || { month, total_amount: 0, count: 0 };
      curr.total_amount += Number(b.total_amount || 0);
      curr.count += 1;
      map.set(month, curr);
    });

    const monthlyTrend = Array.from(map.values()).sort((a,b) => a.month.localeCompare(b.month));

    return { totalAmount, totalTax, totalBills, outstanding, monthlyTrend };
  }, [bills]);

  const healthScore = useMemo(() => computeVendorScore(bills, vendor || {}), [bills, vendor]);

  const SCORE_COLOR =
    healthScore.label === 'Excellent' ? 'text-green-600' :
    healthScore.label === 'Good'      ? 'text-blue-600' :
    healthScore.label === 'Fair'      ? 'text-amber-600' :
    healthScore.label === 'Poor'      ? 'text-red-600' : 'text-gray-500';

  const SCORE_BG =
    healthScore.label === 'Excellent' ? 'bg-green-500' :
    healthScore.label === 'Good'      ? 'bg-blue-500' :
    healthScore.label === 'Fair'      ? 'bg-amber-400' :
    healthScore.label === 'Poor'      ? 'bg-red-500' : 'bg-gray-400';

  if (loading) return <div className="p-4">Loading charts...</div>;

  return (
    <div className="space-y-4">
      {/* Vendor Glance / Health Score */}
      <Card>
        <CardHeader>
          <CardTitle>Vendor Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`text-5xl font-bold ${SCORE_COLOR}`}>
                {healthScore.label === 'New' ? '–' : healthScore.score}
              </div>
              <div className="text-xs text-muted-foreground">out of 100</div>
              <div className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
                healthScore.label === 'Excellent' ? 'bg-green-100 text-green-800' :
                healthScore.label === 'Good'      ? 'bg-blue-100 text-blue-800' :
                healthScore.label === 'Fair'      ? 'bg-amber-100 text-amber-800' :
                healthScore.label === 'Poor'      ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-600'
              }`}>
                {healthScore.label}
              </div>
            </div>

            {/* Breakdown bars */}
            {healthScore.label !== 'New' ? (
              <div className="flex-1 space-y-3">
                {[
                  { label: 'Payment behavior', value: healthScore.breakdown.payment, max: 40, hint: `${healthScore.stats.paidBills}/${healthScore.stats.totalBills} bills paid${healthScore.stats.overdueBills > 0 ? `, ${healthScore.stats.overdueBills} overdue` : ''}` },
                  { label: 'Low outstanding', value: healthScore.breakdown.outstanding, max: 30, hint: healthScore.stats.outstandingAmount > 0 ? `₹${healthScore.stats.outstandingAmount.toLocaleString()} pending` : 'All cleared' },
                  { label: 'Profile completeness', value: healthScore.breakdown.profile, max: 20, hint: 'GST · PAN · Bank · Contact' },
                  { label: 'Recent activity', value: healthScore.breakdown.activity, max: 10, hint: healthScore.breakdown.activity === 10 ? 'Active in last 90 days' : 'No recent bills' },
                ].map(({ label, value, max, hint }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground text-xs">{value}/{max}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${SCORE_BG}`}
                        style={{ width: `${Math.round((value / max) * 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{hint}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 text-sm text-muted-foreground">
                No purchase bills recorded yet. Health score will be calculated once transactions begin.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{summary.totalAmount.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">{summary.totalBills} bill(s)</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">₹{summary.outstanding.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Amount not marked paid</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{summary.totalTax.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total GST/TAX</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Spend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative h-40 flex items-end gap-2">
            {summary.monthlyTrend.length === 0 && (
              <div className="text-muted-foreground p-4">No monthly data</div>
            )}
            {summary.monthlyTrend.map(m => {
              const max = Math.max(...summary.monthlyTrend.map(x => x.total_amount), 1);
              const height = (m.total_amount / max) * 100;
              const label = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short' });
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.max(height, 4)}%` }} title={`₹${m.total_amount.toLocaleString()}`}></div>
                  <div className="text-xs text-muted-foreground mt-2">{label}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {bills.slice(-6).reverse().map(b => (
              <div key={b.id} className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{b.bill_number}</div>
                  <div className="text-xs text-muted-foreground">{new Date(b.bill_date).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${b.status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>₹{Number(b.total_amount).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{b.status || 'pending'}</div>
                </div>
              </div>
            ))}
            {bills.length === 0 && (
              <div className="text-muted-foreground">No bills for this vendor</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorCharts;
