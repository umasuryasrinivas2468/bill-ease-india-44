import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { PurchaseBillRecord } from '@/pages/PurchaseBills';

interface VendorChartsProps {
  vendorId: string;
}

type MonthlyStat = {
  month: string; // YYYY-MM
  total_amount: number;
  count: number;
};

const VendorCharts: React.FC<VendorChartsProps> = ({ vendorId }) => {
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

  if (loading) return <div className="p-4">Loading charts...</div>;

  return (
    <div className="space-y-4">
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
