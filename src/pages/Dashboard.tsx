import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  FileUp,
  IndianRupee,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Cell, Pie, PieChart } from 'recharts';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useExpenseStats } from '@/hooks/useExpenses';
import { useCashflowData, CashflowView } from '@/hooks/useCashflowData';
import { useReceivables } from '@/hooks/useReceivables';
import { usePayables } from '@/hooks/usePayables';
import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const compactNumberFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, value || 0));

const formatCompactCurrency = (value: number) =>
  `${compactNumberFormatter.format(Math.max(0, value || 0))}`;

const receivablePayableConfig = {
  receivables: {
    label: 'Receivables',
    color: 'hsl(var(--primary))',
  },
  payables: {
    label: 'Payables',
    color: 'hsl(var(--accent))',
  },
};

const buildTrendPath = (values: number[]) => {
  const width = 640;
  const height = 220;
  const padding = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / (values.length - 1);
      const normalized = (value - min) / range;
      const y = height - padding - normalized * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
};

const DashboardSkeleton = () => (
  <div className="min-h-full bg-background p-4 md:p-6">
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="space-y-2">
          <div className="h-8 w-40 rounded bg-muted" />
          <div className="h-4 w-56 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-36 rounded-[22px] border border-white/80 bg-[hsl(220_100%_99%/0.94)] shadow-[0_16px_40px_-34px_hsl(var(--primary)/0.24)] dark:border-white/10 dark:bg-[hsl(226_30%_15%/0.92)] dark:shadow-[0_22px_50px_-34px_hsl(0_0%_0%/0.65)]" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <div className="h-[320px] rounded-[8px] border bg-card/70" />
        <div className="space-y-4">
          <div className="h-[96px] rounded-[8px] border bg-card/70" />
          <div className="h-[96px] rounded-[8px] border bg-card/70" />
          <div className="h-[96px] rounded-[8px] border bg-card/70" />
        </div>
      </div>
      <div className="h-[280px] rounded-[8px] border bg-card/70" />
    </div>
  </div>
);

const Dashboard = () => {
  const [activeView, setActiveView] = useState<CashflowView>('month');
  const [openSheet, setOpenSheet] = useState<'cashflow' | 'invoice' | 'report' | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<'receivables' | 'payables'>('receivables');

  const { data: dashboardData, isLoading } = useDashboardStats();
  const { data: expenseStats, isLoading: expensesLoading } = useExpenseStats();
  const { data: cashflowData, isFetching: cashflowFetching } = useCashflowData(activeView);
  const { data: receivables = [], isLoading: receivablesLoading } = useReceivables();
  const { data: payables = [], isLoading: payablesLoading } = usePayables();
  if (isLoading || expensesLoading || receivablesLoading || payablesLoading) {
    return <DashboardSkeleton />;
  }

  const revenue = dashboardData?.totalRevenue || 0;
  const expenses = expenseStats?.totalAmount || 0;
  const pendingAmount = dashboardData?.pendingAmount || 0;
  const profit = revenue - expenses;
  const cashBalance = revenue + pendingAmount - expenses;
  const recentInvoices = dashboardData?.recentInvoices || [];
  const receivablesTotal = receivables
    .filter((receivable) => receivable.status !== 'paid')
    .reduce((sum, receivable) => sum + Number(receivable.amount_remaining || 0), 0);
  const payablesTotal = payables
    .filter((payable) => payable.status !== 'paid')
    .reduce((sum, payable) => sum + Number(payable.amount_remaining || 0), 0);
  const receivablePayableData = [
    {
      name: 'receivables',
      value: receivablesTotal,
      fill: receivablePayableConfig.receivables.color,
    },
    {
      name: 'payables',
      value: payablesTotal,
      fill: receivablePayableConfig.payables.color,
    },
  ];
  const totalOutstanding = receivablesTotal + payablesTotal;
  const selectedLedgerValue = selectedLedger === 'receivables' ? receivablesTotal : payablesTotal;
  const selectedLedgerShare = totalOutstanding > 0 ? Math.round((selectedLedgerValue / totalOutstanding) * 100) : 0;
  const netReceivablePosition = receivablesTotal - payablesTotal;

  // Real-time cashflow chart data
  const chartPoints = cashflowData?.points ?? [];
  const chartValues = chartPoints.length > 0
    ? chartPoints.map((p) => p.net)
    : [0, 0, 0, 0, 0, 0, 0];
  const chartLabels = chartPoints.length > 0
    ? chartPoints.map((p) => p.label)
    : activeView === 'month'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm', '12am'];

  // If all values are zero we still need a renderable path
  const hasRealData = chartValues.some((v) => v !== 0);
  const renderValues = hasRealData ? chartValues : chartValues.map((_, i) => i);
  const chartPath = buildTrendPath(renderValues);

  // Totals for the cashflow summary line
  const totalInflow = chartPoints.reduce((s, p) => s + p.inflow, 0);
  const totalOutflow = chartPoints.reduce((s, p) => s + p.outflow, 0);

  const metrics = [
    {
      title: 'Revenue',
      value: formatCurrency(revenue),
      delta: `${dashboardData?.totalInvoices || 0} invoices`,
      positive: true,
      icon: TrendingUp,
    },
    {
      title: 'Expenses',
      value: formatCurrency(expenses),
      delta: `${expenseStats?.totalExpenses || 0} entries`,
      positive: false,
      icon: IndianRupee,
    },
    {
      title: 'Profit',
      value: formatCurrency(profit),
      delta: profit >= 0 ? 'Healthy margin' : 'Needs attention',
      positive: profit >= 0,
      icon: ArrowUpRight,
    },
    {
      title: 'Cash Balance',
      value: formatCurrency(cashBalance),
      delta: `${formatCompactCurrency(pendingAmount)} pending`,
      positive: cashBalance >= 0,
      icon: Wallet,
    },
  ];

  const ledgerHighlights = {
    receivables: {
      label: 'Receivables',
      description: 'Expected incoming collections still pending.',
      countLabel: `${receivables.filter((item) => item.status !== 'paid').length} open items`,
    },
    payables: {
      label: 'Payables',
      description: 'Vendor bills and outgoing dues to settle.',
      countLabel: `${payables.filter((item) => item.status !== 'paid').length} open items`,
    },
  };

  return (
    <>
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.10),transparent_24%),linear-gradient(180deg,hsl(225_100%_99%/0.82),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_22%),linear-gradient(180deg,hsl(226_30%_16%/0.48),transparent_34%)] p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="overflow-visible px-5 py-6 md:px-7 md:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <SidebarTrigger className="mt-1 md:hidden" />
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Finance Overview</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur">
              <button
                className={cn(
                  'rounded-full px-5 py-2 text-sm transition-colors',
                  activeView === 'day'
                    ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                type="button"
                onClick={() => setActiveView('day')}
              >
                Day
              </button>
              <button
                className={cn(
                  'rounded-full px-5 py-2 text-sm transition-colors',
                  activeView === 'month'
                    ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                type="button"
                onClick={() => setActiveView('month')}
              >
                Month
              </button>
            </div>
            <Button asChild variant="orange" className="rounded-full px-5">
              <Link to="/create-invoice">
                <Plus className="h-4 w-4" />
                Create Invoice
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card
              key={metric.title}
              className="overflow-hidden rounded-[22px] border border-white/90 bg-[linear-gradient(180deg,hsl(0_0%_100%/0.96),hsl(225_100%_99%/0.92))] shadow-[0_18px_44px_-34px_hsl(var(--primary)/0.28)] dark:border-white/10 dark:bg-[linear-gradient(180deg,hsl(226_24%_18%/0.96),hsl(226_22%_14%/0.92))] dark:shadow-[0_24px_52px_-34px_hsl(0_0%_0%/0.7)]"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
                    <div className="text-3xl font-semibold tracking-tight">{metric.value}</div>
                    <div
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                        metric.positive
                          ? 'bg-primary/10 text-primary'
                          : 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                      )}
                    >
                      {metric.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {metric.delta}
                    </div>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,hsl(var(--primary)/0.10),hsl(var(--primary)/0.06))] text-primary dark:bg-[linear-gradient(180deg,hsl(var(--primary)/0.22),hsl(var(--primary)/0.12))]">
                    <metric.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick action buttons — centered */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          <Button variant="outline" className="rounded-full border-primary/20 bg-card/70 px-5 hover:bg-primary/10" onClick={() => setOpenSheet('cashflow')}>
            <TrendingUp className="h-4 w-4 text-primary" />
            Cashflow
          </Button>
          <Button variant="outline" className="rounded-full border-primary/20 bg-card/70 px-5 hover:bg-primary/10" onClick={() => setOpenSheet('invoice')}>
            <FileUp className="h-4 w-4 text-primary" />
            Send Invoice
          </Button>
          <Button variant="outline" className="rounded-full border-primary/20 bg-card/70 px-5 hover:bg-primary/10" onClick={() => setOpenSheet('report')}>
            <BarChart3 className="h-4 w-4 text-primary" />
            View Report
          </Button>
        </div>

        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
          <Card className="rounded-[8px] border-white/40 bg-card/80 shadow-[0_24px_60px_-32px_hsl(var(--primary)/0.45)] backdrop-blur">
            <CardContent className="p-6 md:p-8">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Cash Flow</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeView === 'day'
                      ? "Today's cash movement by hour."
                      : 'Weekly movement based on current invoice and expense activity.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Live indicator */}
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full bg-emerald-500',
                        cashflowFetching ? 'animate-ping' : 'animate-pulse'
                      )}
                    />
                    Live
                  </span>
                  <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                    {activeView === 'day' ? 'Today' : 'Last 7 days'}
                  </div>
                </div>
              </div>

              {/* Inflow / Outflow summary */}
              {chartPoints.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm">
                    <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Inflow</span>
                    <span className="font-semibold text-primary">{formatCurrency(totalInflow)}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--accent))]/20 bg-[hsl(var(--accent))]/5 px-4 py-1.5 text-sm">
                    <ArrowDownRight className="h-3.5 w-3.5 text-[hsl(var(--accent))]" />
                    <span className="text-muted-foreground">Outflow</span>
                    <span className="font-semibold text-[hsl(var(--accent))]">{formatCurrency(totalOutflow)}</span>
                  </div>
                  <div className={cn(
                    'flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm',
                    totalInflow - totalOutflow >= 0
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20'
                      : 'border-destructive/20 bg-destructive/5'
                  )}>
                    <span className="text-muted-foreground">Net</span>
                    <span className={cn(
                      'font-semibold',
                      totalInflow - totalOutflow >= 0 ? 'text-emerald-600' : 'text-destructive'
                    )}>
                      {totalInflow - totalOutflow >= 0 ? '+' : ''}{formatCurrency(totalInflow - totalOutflow)}
                    </span>
                  </div>
                </div>
              )}

              <div className="relative overflow-hidden rounded-[8px] border border-border/60 bg-background/70 p-4 md:p-6">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,transparent_80%,hsl(var(--primary)/0.04))]" />
                <div className="relative h-[240px]">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2, 3].map((line) => (
                      <div key={line} className="border-t border-dashed border-primary/15" />
                    ))}
                  </div>
                  <svg viewBox="0 0 640 220" className="h-full w-full">
                    <defs>
                      <linearGradient id="cashFlowStroke" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="hsl(var(--accent))" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" />
                      </linearGradient>
                      <linearGradient id="cashFlowFill" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Filled area under the line */}
                    <path
                      d={`${chartPath} L 620 220 L 20 220 Z`}
                      fill="url(#cashFlowFill)"
                    />
                    <path d={chartPath} fill="none" stroke="url(#cashFlowStroke)" strokeLinecap="round" strokeWidth="4" />
                    {/* Data point dots */}
                    {hasRealData && renderValues.map((val, i) => {
                      const width = 640;
                      const height = 220;
                      const padding = 20;
                      const min = Math.min(...renderValues);
                      const max = Math.max(...renderValues);
                      const range = max - min || 1;
                      const x = padding + (i * (width - padding * 2)) / (renderValues.length - 1);
                      const normalized = (val - min) / range;
                      const y = height - padding - normalized * (height - padding * 2);
                      return (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r="5"
                          fill="hsl(var(--primary))"
                          stroke="hsl(var(--background))"
                          strokeWidth="2"
                        />
                      );
                    })}
                  </svg>
                </div>
                <div
                  className="mt-4 text-center text-xs font-medium text-muted-foreground"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${chartLabels.length}, 1fr)`,
                    gap: '0.5rem',
                  }}
                >
                  {chartLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>

              {!hasRealData && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  No {activeView === 'day' ? "today's" : 'this week\'s'} transactions yet — data will appear here as invoices and expenses are recorded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-[8px] border-white/40 bg-card/80 shadow-[0_20px_50px_-34px_hsl(var(--primary)/0.45)] backdrop-blur">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Receivables vs Payables</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Live split of pending incoming and outgoing balances.
                  </p>
                </div>
                <div className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  netReceivablePosition >= 0
                    ? 'bg-primary/10 text-primary'
                    : 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                )}>
                  Net {netReceivablePosition >= 0 ? '+' : '-'}{formatCurrency(Math.abs(netReceivablePosition))}
                </div>
              </div>

              <div className="mt-6">
                <div className="relative mx-auto h-56 max-w-[280px]">
                  <ChartContainer
                    config={receivablePayableConfig}
                    className="mx-auto aspect-square h-full"
                  >
                    <PieChart>
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => (
                              <div className="flex min-w-[10rem] items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {name === 'receivables' ? 'Receivables' : 'Payables'}
                                </span>
                                <span className="font-medium text-foreground">
                                  {formatCurrency(Number(value))}
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Pie
                        data={receivablePayableData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={88}
                        paddingAngle={6}
                        cornerRadius={10}
                        strokeWidth={0}
                        onMouseEnter={(_, index) => setSelectedLedger(index === 0 ? 'receivables' : 'payables')}
                        isAnimationActive
                        animationDuration={650}
                        animationEasing="ease-out"
                      >
                        {receivablePayableData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={entry.fill}
                            style={{
                              filter: selectedLedger === entry.name ? 'drop-shadow(0 12px 18px rgba(15, 23, 42, 0.18))' : 'none',
                              transform: selectedLedger === entry.name ? 'scale(1.04)' : 'scale(1)',
                              transformOrigin: 'center',
                              transition: 'transform 260ms ease, filter 260ms ease',
                            }}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-40 overflow-hidden text-center">
                      <div
                        className="flex transition-transform duration-300 ease-out"
                        style={{
                          width: '200%',
                          transform: selectedLedger === 'receivables' ? 'translateX(0%)' : 'translateX(-50%)',
                        }}
                      >
                        {(['receivables', 'payables'] as const).map((item) => (
                          <div key={item} className="w-1/2 shrink-0 px-2">
                            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                              {ledgerHighlights[item].label}
                            </p>
                            <p className="mt-2 text-2xl font-semibold tracking-tight">
                              {formatCompactCurrency(item === 'receivables' ? receivablesTotal : payablesTotal)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{ledgerHighlights[item].countLabel}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative mt-5 rounded-full bg-muted/70 p-1">
                  <div
                    className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-out"
                    style={{
                      transform: selectedLedger === 'receivables' ? 'translateX(0)' : 'translateX(calc(100% + 0.5rem))',
                    }}
                  />
                  <div className="relative grid grid-cols-2 gap-1">
                    {(['receivables', 'payables'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setSelectedLedger(item)}
                        className={cn(
                          'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                          selectedLedger === item ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {ledgerHighlights[item].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-[8px] border border-border/60 bg-background/60 p-4">
                  <p className="text-sm font-medium">{ledgerHighlights[selectedLedger].description}</p>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight">{formatCurrency(selectedLedgerValue)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedLedgerShare}% of total outstanding exposure
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{ledgerHighlights[selectedLedger].countLabel}</p>
                      <p className="mt-1">Total open: {formatCurrency(totalOutstanding)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[8px] border-white/40 bg-card/80 shadow-[0_24px_60px_-32px_hsl(var(--primary)/0.42)] backdrop-blur">
          <CardContent className="p-6 md:p-8">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Recent Transactions</h2>
                <p className="mt-1 text-sm text-muted-foreground">Latest invoice activity shown in a cleaner dashboard table.</p>
              </div>
              <Button asChild variant="ghost" className="justify-start rounded-full px-0 text-primary hover:bg-transparent hover:text-primary/80">
                <Link to="/invoices">View all invoices</Link>
              </Button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-primary/20 bg-background/60 px-6 py-12 text-center">
                <p className="text-lg font-medium">No transactions yet</p>
                <p className="mt-2 text-sm text-muted-foreground">Create your first invoice and this dashboard will start filling up automatically.</p>
                <Button asChild variant="orange" className="mt-5 rounded-full px-5">
                  <Link to="/create-invoice">Create Invoice</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[8px] border border-border/60 bg-background/60">
                <div className="hidden grid-cols-[1.2fr_1.6fr_1fr_0.9fr] gap-4 border-b border-border/60 px-6 py-4 text-sm font-semibold text-muted-foreground md:grid">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Amount</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-border/60">
                  {recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1.2fr_1.6fr_1fr_0.9fr] md:items-center">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground md:hidden">Date</p>
                        <p className="font-medium">
                          {new Date(invoice.invoice_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground md:hidden">Description</p>
                        <p className="font-medium">{invoice.client_name}</p>
                        <p className="text-sm text-muted-foreground">{invoice.invoice_number}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground md:hidden">Amount</p>
                        <p className="font-semibold">{formatCurrency(Number(invoice.total_amount))}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground md:hidden">Status</p>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize',
                            invoice.status === 'paid' && 'bg-primary/10 text-primary',
                            invoice.status === 'pending' && 'bg-amber-100 text-amber-700',
                            invoice.status === 'overdue' && 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                          )}
                        >
                          {invoice.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>

    {/* ── Cashflow Sheet ── */}

    <Sheet open={openSheet === 'cashflow'} onOpenChange={(o) => !o && setOpenSheet(null)}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Cashflow Summary</SheetTitle>
          <SheetDescription>{activeView === 'day' ? "Today's" : "Last 7 days'"} cash movement</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Inflow', value: formatCurrency(totalInflow), color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Outflow', value: formatCurrency(totalOutflow), color: 'text-[hsl(var(--accent))]', bg: 'bg-[hsl(var(--accent))]/5' },
              { label: 'Net', value: formatCurrency(totalInflow - totalOutflow), color: totalInflow - totalOutflow >= 0 ? 'text-primary' : 'text-destructive', bg: 'bg-primary/5' },
            ].map((item) => (
              <div key={item.label} className={cn('rounded-xl p-4 text-center', item.bg)}>
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className={cn('text-sm font-semibold', item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-background/70 p-4">
            <p className="text-sm font-medium mb-3 text-muted-foreground">Period Breakdown</p>
            <div className="space-y-2">
              {chartPoints.length > 0 ? chartPoints.map((p) => (
                <div key={p.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{p.label}</span>
                  <span className={cn('font-medium', p.net >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                    {p.net >= 0 ? '+' : ''}{formatCurrency(p.net)}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet for this period.</p>
              )}
            </div>
          </div>
          <Button asChild variant="outline" className="w-full rounded-full" onClick={() => setOpenSheet(null)}>
            <Link to="/reports/cash-flow-forecasting">Open full report</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    {/* ── Send Invoice Sheet ── */}
    <Sheet open={openSheet === 'invoice'} onOpenChange={(o) => !o && setOpenSheet(null)}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-primary" /> Send Invoice</SheetTitle>
          <SheetDescription>Recent invoices ready to send</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          {recentInvoices.length > 0 ? (
            <div className="rounded-xl border border-border/60 bg-background/70 divide-y divide-border/60">
              {recentInvoices.slice(0, 6).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.client_name}</p>
                    <p className="text-xs text-muted-foreground">{inv.invoice_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(Number(inv.total_amount))}</p>
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                      inv.status === 'paid' && 'bg-primary/10 text-primary',
                      inv.status === 'pending' && 'bg-amber-100 text-amber-700',
                      inv.status === 'overdue' && 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                    )}>{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices yet.</p>
          )}
          <Button asChild variant="orange" className="w-full rounded-full" onClick={() => setOpenSheet(null)}>
            <Link to="/create-invoice"><Plus className="h-4 w-4" /> Create New Invoice</Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full" onClick={() => setOpenSheet(null)}>
            <Link to="/invoices">View all invoices</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    {/* ── View Report Sheet ── */}
    <Sheet open={openSheet === 'report'} onOpenChange={(o) => !o && setOpenSheet(null)}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Reports Overview</SheetTitle>
          <SheetDescription>Financial summary across all categories</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Revenue', value: formatCurrency(revenue), color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Total Expenses', value: formatCurrency(expenses), color: 'text-[hsl(var(--accent))]', bg: 'bg-[hsl(var(--accent))]/5' },
              { label: 'Net Profit', value: formatCurrency(profit), color: profit >= 0 ? 'text-primary' : 'text-destructive', bg: 'bg-primary/5' },
              { label: 'Cash Balance', value: formatCurrency(cashBalance), color: cashBalance >= 0 ? 'text-primary' : 'text-destructive', bg: 'bg-primary/5' },
            ].map((item) => (
              <div key={item.label} className={cn('rounded-xl p-4', item.bg)}>
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className={cn('text-sm font-semibold', item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
          {expenseStats?.categoryBreakdown && expenseStats.categoryBreakdown.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-sm font-medium mb-3 text-muted-foreground">Expense by Category</p>
              <div className="space-y-2">
                {expenseStats.categoryBreakdown.slice(0, 6).map((cat) => (
                  <div key={cat.category_name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{cat.category_name}</span>
                    <span className="font-medium">{formatCurrency(cat.total_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Button asChild variant="outline" className="w-full rounded-full" onClick={() => setOpenSheet(null)}>
            <Link to="/reports">Open full reports</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
};

export default Dashboard;
