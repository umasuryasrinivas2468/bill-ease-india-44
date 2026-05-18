import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, CalendarClock } from 'lucide-react';
import { useUpcomingEmis } from '@/hooks/useLiabilities';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const EmiCalendar: React.FC = () => {
  const [horizon, setHorizon] = useState('60');
  const { data: emis = [] } = useUpcomingEmis(Number(horizon));

  const grouped = useMemo(() => {
    const map = new Map<string, typeof emis>();
    for (const e of emis) {
      const key = e.due_date.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [emis]);

  const today = new Date().toISOString().slice(0, 10);

  const monthLabel = (key: string) => {
    const d = new Date(`${key}-01`);
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/liabilities"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarClock className="h-6 w-6" />EMI Calendar</h1>
        </div>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 6 months</SelectItem>
            <SelectItem value="365">Next 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {grouped.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No upcoming EMIs in this window.</CardContent></Card>
      )}

      {grouped.map(([month, items]) => {
        const monthTotal = items.reduce((s, e) => s + Number(e.total_emi), 0);
        return (
          <Card key={month}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{monthLabel(month)}</CardTitle>
              <div className="text-sm text-muted-foreground">{items.length} EMI{items.length === 1 ? '' : 's'} • <span className="font-semibold text-foreground">{inr(monthTotal)}</span></div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map((e) => {
                  const overdue = e.due_date < today;
                  return (
                    <Link key={e.id} to={`/liabilities/${e.liability_id}`}>
                      <div className={`rounded-lg border p-3 hover:shadow transition ${overdue ? 'border-red-500/40 bg-red-500/5' : 'bg-card'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-xs text-muted-foreground">{e.due_date}</div>
                            <div className="font-medium">{e.liability_name}</div>
                            <div className="text-xs text-muted-foreground">{e.lender_name || ''} • EMI {e.emi_number}</div>
                          </div>
                          {overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
                        </div>
                        <div className="mt-2 flex justify-between text-sm">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold">{inr(e.total_emi)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">P {inr(e.principal_component)} • I {inr(e.interest_component)}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default EmiCalendar;
