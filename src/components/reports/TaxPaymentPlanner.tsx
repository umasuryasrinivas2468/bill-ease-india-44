import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wallet, CalendarClock, Target } from 'lucide-react';
import { useGSTLiability } from '@/hooks/useGSTLiability';
import { formatINR, gstr3bDueDate, shiftMonth, round2 } from '@/lib/gst';

// Tax Payment Planner (Feature #25)
// - Net GST payable for the current return period
// - Next 3 GSTR-3B due dates
// - Suggested reserve = rolling average of the last 3 months' net cash payable
// Useful so a business sets aside cash ahead of the 20th.
const TaxPaymentPlanner: React.FC = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const m0 = currentMonth;
  const m1 = shiftMonth(currentMonth, -1);
  const m2 = shiftMonth(currentMonth, -2);

  const cur = useGSTLiability(m0);
  const prev1 = useGSTLiability(m1);
  const prev2 = useGSTLiability(m2);

  const netNow = cur.data?.net_payable.total_cash ?? 0;

  const rollingAvg = useMemo(() => {
    const vals = [
      cur.data?.net_payable.total_cash,
      prev1.data?.net_payable.total_cash,
      prev2.data?.net_payable.total_cash,
    ].filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return 0;
    return round2(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [cur.data, prev1.data, prev2.data]);

  // Suggested reserve: max of current liability and rolling avg, with a
  // 10% buffer so a spike month doesn't leave the business short.
  const suggestedReserve = round2(Math.max(netNow, rollingAvg) * 1.1);

  const due0 = gstr3bDueDate(m0); // due for current month's return (filed next month)
  const due1 = gstr3bDueDate(shiftMonth(m0, 1));
  const due2 = gstr3bDueDate(shiftMonth(m0, 2));

  const daysUntil = (iso: string) => {
    if (!iso) return 0;
    const today = new Date();
    const target = new Date(iso);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-violet-600" />
          Tax Payment Planner
        </CardTitle>
        <CardDescription>
          Plan your GST cash outflow — net payable, due dates, and suggested reserve
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Tile
            tone="red"
            icon={<Wallet className="h-4 w-4" />}
            label={`Net Payable (${m0})`}
            value={formatINR(netNow)}
            hint="Output − ITC + RCM"
          />
          <Tile
            tone="blue"
            icon={<CalendarClock className="h-4 w-4" />}
            label="Next Due Date"
            value={due0 || '—'}
            hint={due0 ? `${daysUntil(due0)} day(s) away` : ''}
          />
          <Tile
            tone="emerald"
            icon={<Target className="h-4 w-4" />}
            label="Suggested Reserve"
            value={formatINR(suggestedReserve)}
            hint="Rolling avg + 10% buffer"
          />
        </div>

        {/* Upcoming schedule */}
        <div className="border rounded-lg divide-y">
          <div className="p-3 font-medium text-sm">Upcoming GSTR-3B due dates</div>
          <Row label={`Return ${m0}`} due={due0} days={daysUntil(due0)} amount={netNow} />
          <Row
            label={`Return ${shiftMonth(m0, 1)}`}
            due={due1}
            days={daysUntil(due1)}
            amount={rollingAvg}
            estimated
          />
          <Row
            label={`Return ${shiftMonth(m0, 2)}`}
            due={due2}
            days={daysUntil(due2)}
            amount={rollingAvg}
            estimated
          />
        </div>

        {/* 3-month history */}
        <div className="border rounded-lg p-3">
          <div className="font-medium text-sm mb-2">Recent periods</div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <HistoryTile period={m2} amount={prev2.data?.net_payable.total_cash} />
            <HistoryTile period={m1} amount={prev1.data?.net_payable.total_cash} />
            <HistoryTile period={m0} amount={cur.data?.net_payable.total_cash} current />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          "Suggested reserve" is indicative — keep aside this amount after every
          sale so you're not scrambling on the 20th. Actual payment happens via
          the GST portal challan.
        </p>
      </CardContent>
    </Card>
  );
};

const Tile: React.FC<{
  tone: 'red' | 'blue' | 'emerald';
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}> = ({ tone, icon, label, value, hint }) => {
  const toneCls = {
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div className={`border rounded-lg p-4 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] opacity-80 mt-0.5">{hint}</div>}
    </div>
  );
};

const Row: React.FC<{
  label: string;
  due: string;
  days: number;
  amount: number;
  estimated?: boolean;
}> = ({ label, due, days, amount, estimated }) => (
  <div className="flex items-center justify-between p-3 text-sm">
    <div>
      <div className="font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">
        Due {due} {days > 0 ? `• in ${days} day(s)` : days === 0 ? '• today' : `• ${Math.abs(days)} day(s) overdue`}
      </div>
    </div>
    <div className="text-right">
      <div className="font-medium">{formatINR(amount)}</div>
      {estimated && <div className="text-[11px] text-muted-foreground">estimated</div>}
    </div>
  </div>
);

const HistoryTile: React.FC<{
  period: string;
  amount: number | undefined;
  current?: boolean;
}> = ({ period, amount, current }) => (
  <div className={`border rounded p-2 ${current ? 'border-primary bg-primary/5' : ''}`}>
    <div className="text-muted-foreground">{period}</div>
    <div className="font-medium">{formatINR(amount || 0)}</div>
  </div>
);

export default TaxPaymentPlanner;
