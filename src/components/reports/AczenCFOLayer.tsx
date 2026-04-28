import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Brain, AlertCircle, IndianRupee, TrendingDown, Sun, Send,
} from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { useUser } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

// AI Premium Layer (#26 – #30) — bundled into one Aczen CFO surface so the
// founder gets pulse insights, recovery suggestions, cost-cut tips, cash
// crunch warnings, and a Q&A box on a single page.
//
// Insights are computed deterministically from the user's data so they
// work without an LLM. The Ask box queues the question to `cfo_questions`
// for an AI worker to answer asynchronously; if no worker is wired up,
// the question is at least logged and the local heuristic answer shows.

const AczenCFOLayer: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── #30 Founder Daily Pulse ──────────────────────────────────────────
  const pulse = useMemo(() => {
    const today = new Date();
    const ystr = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    const salesYesterday = invoices
      .filter((i: any) => i.invoice_date === ystr)
      .reduce((s, i: any) => s + Number(i.total_amount || 0), 0);

    const collectionsYesterday = invoices
      .filter((i: any) => i.status === 'paid' && (i.updated_at || '').startsWith(ystr))
      .reduce((s, i: any) => s + Number(i.total_amount || 0), 0);

    const payablesDue = expenses
      .filter((e: any) => e.status !== 'posted' && e.expense_date <= todayStr && e.expense_date >= monthStart)
      .reduce((s, e: any) => s + Number(e.total_amount || 0), 0);

    const inflow = invoices
      .filter((i: any) => i.status === 'paid' && (i.updated_at || '').slice(0, 10) >= monthStart)
      .reduce((s, i: any) => s + Number(i.total_amount || 0), 0);
    const outflow = expenses
      .filter((e: any) => (e.expense_date || '').slice(0, 10) >= monthStart)
      .reduce((s, e: any) => s + Number(e.total_amount || 0), 0);
    const cashEstimate = inflow - outflow;

    const overdueCount = invoices.filter((i: any) => i.status === 'overdue').length;

    return { salesYesterday, collectionsYesterday, payablesDue, cashEstimate, overdueCount };
  }, [invoices, expenses]);

  // ── #27 Auto Recovery Suggestions ────────────────────────────────────
  const recovery = useMemo(() => {
    const open = invoices
      .filter((i: any) => i.status !== 'paid' && Number(i.total_amount || 0) > Number(i.paid_amount || 0))
      .map((i: any) => ({
        ...i,
        balance: Number(i.total_amount || 0) - Number(i.paid_amount || 0),
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
    const total = open.reduce((s, i: any) => s + i.balance, 0);
    return { open, total };
  }, [invoices]);

  // ── #28 Smart Cost Cutting Suggestions ───────────────────────────────
  const costCuts = useMemo(() => {
    // Vendor-level: vendors paying ≥ 18% above category median
    const byCategoryVendor = new Map<string, Map<string, number[]>>();
    expenses.forEach((e: any) => {
      const cat = e.category_name;
      if (!byCategoryVendor.has(cat)) byCategoryVendor.set(cat, new Map());
      const m = byCategoryVendor.get(cat)!;
      const arr = m.get(e.vendor_name) || [];
      arr.push(Number(e.total_amount || 0));
      m.set(e.vendor_name, arr);
    });

    const suggestions: { vendor: string; category: string; over: number; pct: number }[] = [];
    byCategoryVendor.forEach((vendors, cat) => {
      const allBills: number[] = [];
      vendors.forEach((arr) => arr.forEach((a) => allBills.push(a)));
      if (allBills.length < 3) return;
      const sorted = [...allBills].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      vendors.forEach((arr, vendor) => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (median > 0 && avg > median * 1.18) {
          const over = (avg - median) * arr.length;
          suggestions.push({
            vendor, category: cat,
            over, pct: ((avg - median) / median) * 100,
          });
        }
      });
    });
    return suggestions.sort((a, b) => b.over - a.over).slice(0, 5);
  }, [expenses]);

  // ── #29 Future Cash Crunch Predictor ─────────────────────────────────
  const crunch = useMemo(() => {
    // 30-day projection: expected inflow (open invoices due in 30d) vs
    // expected outflow (recurring categories from last month).
    const today = new Date();
    const horizon = new Date(today); horizon.setDate(today.getDate() + 30);
    const expectedIn = invoices
      .filter((i: any) => i.status !== 'paid' && i.due_date && new Date(i.due_date) <= horizon)
      .reduce((s, i: any) => s + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);

    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7);
    const expectedOut = expenses
      .filter((e: any) => (e.expense_date || '').startsWith(lastMonth))
      .reduce((s, e: any) => s + Number(e.total_amount || 0), 0);

    const net = expectedIn - expectedOut;
    return { expectedIn, expectedOut, net };
  }, [invoices, expenses]);

  // ── #26 Ask Aczen CFO ────────────────────────────────────────────────
  const [question, setQuestion] = useState('');
  const askMutation = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in');
      if (!question.trim()) throw new Error('Type a question');
      const heuristic = answerHeuristic(question, { pulse, recovery, costCuts, crunch });
      const { error } = await supabase.from('cfo_questions').insert({
        user_id: uid,
        question,
        answer: heuristic,
        context: { pulse, recovery: recovery.total, costCuts: costCuts.length, crunch },
      });
      if (error) throw error;
      return heuristic;
    },
    onSuccess: () => {
      toast({ title: 'Logged', description: 'CFO insight available below.' });
      setQuestion('');
      qc.invalidateQueries({ queryKey: ['cfo-questions', uid] });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['cfo-questions', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('cfo_questions').select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!uid,
  });

  return (
    <div className="space-y-6">
      {/* #30 Founder Daily Pulse */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-yellow-500" /> Founder Daily Pulse
          </CardTitle>
          <CardDescription>Morning summary — what to know in 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Sales yesterday" value={formatINR(pulse.salesYesterday)} />
            <Stat label="Collections yesterday" value={formatINR(pulse.collectionsYesterday)} highlight={pulse.collectionsYesterday > 0} />
            <Stat label="Payables this month" value={formatINR(pulse.payablesDue)} />
            <Stat label="Net cash (MTD)" value={formatINR(pulse.cashEstimate)} highlight={pulse.cashEstimate > 0} />
            <Stat label="Overdue invoices" value={`${pulse.overdueCount}`} warn={pulse.overdueCount > 0} />
          </div>
        </CardContent>
      </Card>

      {/* #26 Ask Aczen CFO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Ask Aczen CFO
          </CardTitle>
          <CardDescription>Why did profit drop? Are receivables slowing? — ask in plain English.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Why did profit drop this month?"
              onKeyDown={(e) => e.key === 'Enter' && askMutation.mutate()}
            />
            <Button onClick={() => askMutation.mutate()} disabled={askMutation.isPending}>
              <Send className="h-4 w-4 mr-2" /> Ask
            </Button>
          </div>
          {history.length > 0 && (
            <div className="mt-4 space-y-2">
              {history.map((h: any) => (
                <div key={h.id} className="border rounded-md p-3 text-sm">
                  <div className="font-medium">{h.question}</div>
                  <div className="text-muted-foreground mt-1">{h.answer}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* #27 Auto Recovery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-green-600" /> Auto Recovery Suggestions
          </CardTitle>
          <CardDescription>
            "₹{recovery.total.toLocaleString('en-IN')} collectible from {recovery.open.length} customers now."
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recovery.open.length === 0 ? (
            <div className="text-sm text-muted-foreground">No open balances. Books are clean.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {recovery.open.map((i: any) => (
                <li key={i.id} className="flex items-center justify-between border rounded-md p-2">
                  <div>
                    <span className="font-mono text-xs mr-2">{i.invoice_number}</span>
                    <span>{i.client_name}</span>
                  </div>
                  <Badge variant="secondary">{formatINR(i.balance)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* #28 Smart Cost Cutting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-blue-500" /> Smart Cost Cutting Suggestions
          </CardTitle>
          <CardDescription>Vendors charging materially above the category median.</CardDescription>
        </CardHeader>
        <CardContent>
          {costCuts.length === 0 ? (
            <div className="text-sm text-muted-foreground">Spending looks aligned across vendors.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {costCuts.map((c, idx) => (
                <li key={idx} className="border rounded-md p-2">
                  Switch <b>{c.vendor}</b> ({c.category}) — avg cost <b>{c.pct.toFixed(0)}%</b> above category median.
                  Annualised opportunity: <Badge variant="default">{formatINR(c.over)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* #29 Cash Crunch Predictor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" /> Future Cash Crunch Predictor
          </CardTitle>
          <CardDescription>30-day projection — expected inflow vs outflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="Expected inflow (30d)" value={formatINR(crunch.expectedIn)} highlight={crunch.expectedIn > 0} />
            <Stat label="Expected outflow (30d)" value={formatINR(crunch.expectedOut)} />
            <Stat label="Projected net" value={formatINR(crunch.net)} warn={crunch.net < 0} highlight={crunch.net > 0} />
          </div>
          {crunch.net < 0 && (
            <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-200 text-sm">
              <b>Cash crunch warning:</b> projected outflow exceeds inflow by {formatINR(Math.abs(crunch.net))}.
              Push collection on the top 5 receivables before next month.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; warn?: boolean; highlight?: boolean }> = ({ label, value, warn, highlight }) => (
  <Card className={warn ? 'bg-red-50 border-red-200' : highlight ? 'bg-green-50 border-green-200' : ''}>
    <CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${warn ? 'text-red-700' : highlight ? 'text-green-700' : ''}`}>{value}</div>
    </CardContent>
  </Card>
);

function answerHeuristic(q: string, ctx: any): string {
  const lc = q.toLowerCase();
  const lines: string[] = [];
  if (/profit|margin/.test(lc)) {
    lines.push(`Receivables open: ${formatINR(ctx.recovery.total)} from top customers.`);
    if (ctx.costCuts.length) lines.push(`Vendor outliers detected: ${ctx.costCuts.length}.`);
    lines.push(`Net 30-day projection: ${formatINR(ctx.crunch.net)}.`);
  } else if (/collect|recover|due/.test(lc)) {
    lines.push(`Top recoverable balance: ${formatINR(ctx.recovery.total)}.`);
    lines.push(`${ctx.pulse.overdueCount} invoices currently overdue.`);
  } else if (/cash|runway|burn/.test(lc)) {
    lines.push(`Projected 30-day net cash: ${formatINR(ctx.crunch.net)}.`);
    lines.push(`MTD net: ${formatINR(ctx.pulse.cashEstimate)}.`);
  } else if (/cost|spend|expense/.test(lc)) {
    if (ctx.costCuts.length) lines.push(`Top cost-cut: ${ctx.costCuts[0].vendor} (+${ctx.costCuts[0].pct.toFixed(0)}% above median).`);
    else lines.push(`Spend distribution looks aligned with category medians.`);
  } else {
    lines.push(`Sales yesterday: ${formatINR(ctx.pulse.salesYesterday)}; collections: ${formatINR(ctx.pulse.collectionsYesterday)}.`);
    lines.push(`Open recoverables: ${formatINR(ctx.recovery.total)}.`);
  }
  return lines.join(' ');
}

export default AczenCFOLayer;
