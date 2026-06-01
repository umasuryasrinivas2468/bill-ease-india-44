import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchProfitabilityByDimension, type ProfitabilityDimension } from '@/services/financialStatementsService';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const dimLabel: Record<ProfitabilityDimension, string> = {
  project:     'Project',
  branch:      'Branch',
  cost_center: 'Cost Center',
  department:  'Department',
};

const startOfFy = () => {
  const d = new Date();
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

const ProfitabilityByDimension: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [fromDate, setFromDate] = useState(startOfFy());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [dim, setDim] = useState<ProfitabilityDimension>('project');

  const { data } = useQuery({
    queryKey: ['profitability', userId, dim, fromDate, toDate],
    queryFn: () => userId ? fetchProfitabilityByDimension(userId, dim, fromDate, toDate) : Promise.resolve(null),
    enabled: !!userId,
  });

  const rows = data?.rows ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      revenue:    acc.revenue    + (Number(r.revenue) || 0),
      expenses:   acc.expenses   + (Number(r.expenses) || 0),
      net_profit: acc.net_profit + (Number(r.net_profit) || 0),
    }),
    { revenue: 0, expenses: 0, net_profit: 0 },
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profitability by Dimension</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Where the money is made and lost — journal-derived Revenue − Expenses grouped by Project, Branch, Cost Center or Department.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Dimension</Label>
            <Tabs value={dim} onValueChange={v => setDim(v as ProfitabilityDimension)}>
              <TabsList>
                <TabsTrigger value="project">Project</TabsTrigger>
                <TabsTrigger value="branch">Branch</TabsTrigger>
                <TabsTrigger value="cost_center">Cost Center</TabsTrigger>
                <TabsTrigger value="department">Department</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Rows</div><div className="text-2xl font-bold">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Revenue</div><div className="text-xl font-semibold text-emerald-700">{fmtINR(totals.revenue)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Expenses</div><div className="text-xl font-semibold text-rose-700">{fmtINR(totals.expenses)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Net Profit</div><div className={`text-xl font-semibold ${totals.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(totals.net_profit)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>By {dimLabel[dim]}</CardTitle>
            <Badge variant="outline" className="text-[10px]">SSOT • journal_lines</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{dimLabel[dim]}</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const margin = r.revenue > 0 ? (r.net_profit / r.revenue) * 100 : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right text-emerald-700">{fmtINR(r.revenue)}</TableCell>
                      <TableCell className="text-right text-rose-700">{fmtINR(r.expenses)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.net_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(r.net_profit)}</TableCell>
                      <TableCell className="text-right">
                        {margin == null ? '—' : `${margin.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No tagged journal lines in this range. Tag invoices / expenses with {dimLabel[dim].toLowerCase()} to populate this view.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfitabilityByDimension;
