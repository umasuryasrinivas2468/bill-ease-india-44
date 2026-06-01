import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fetchArApAging, type AgingParty } from '@/services/financialStatementsService';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Math.abs(Number(n)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const AgingReports: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const today = new Date().toISOString().slice(0, 10);

  const { data: ar } = useQuery({
    queryKey: ['ar-aging-journal', userId, today],
    queryFn: () => userId ? fetchArApAging(userId, 'customer', today) : Promise.resolve(null),
    enabled: !!userId,
  });
  const { data: ap } = useQuery({
    queryKey: ['ap-aging-journal', userId, today],
    queryFn: () => userId ? fetchArApAging(userId, 'vendor', today) : Promise.resolve(null),
    enabled: !!userId,
  });

  const renderTable = (title: string, desc: string, rows: AgingParty[] | undefined, partyHeader: string) => (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{desc}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px]">Source: journal_lines (SSOT)</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{partyHeader}</TableHead>
                <TableHead className="text-right">0–30</TableHead>
                <TableHead className="text-right">31–60</TableHead>
                <TableHead className="text-right">61–90</TableHead>
                <TableHead className="text-right text-amber-700">&gt; 90</TableHead>
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map(r => (
                <TableRow key={r.party_id}>
                  <TableCell className="font-medium">{r.party_name ?? '—'}</TableCell>
                  <TableCell className="text-right">{fmtINR(r.b_0_30)}</TableCell>
                  <TableCell className="text-right">{fmtINR(r.b_31_60)}</TableCell>
                  <TableCell className="text-right">{fmtINR(r.b_61_90)}</TableCell>
                  <TableCell className={`text-right ${r.b_90_plus > 0 ? 'text-amber-700 font-semibold' : ''}`}>{fmtINR(r.b_90_plus)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtINR(r.balance)}</TableCell>
                </TableRow>
              ))}
              {(!rows || rows.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No outstanding balances.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">AR Total</div>
          <div className="text-xl font-bold">{fmtINR(ar?.summary?.total)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{ar?.summary?.party_count ?? 0} customers</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">AR &gt; 90 days</div>
          <div className="text-xl font-bold text-amber-700">{fmtINR(ar?.summary?.bucket_90_plus)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">AP Total</div>
          <div className="text-xl font-bold">{fmtINR(ap?.summary?.total)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{ap?.summary?.party_count ?? 0} vendors</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">AP &gt; 90 days</div>
          <div className="text-xl font-bold text-amber-700">{fmtINR(ap?.summary?.bucket_90_plus)}</div>
        </CardContent></Card>
      </div>

      {renderTable('Customer Aging', 'Receivables grouped by age of the underlying journal line', ar?.parties, 'Customer')}
      {renderTable('Vendor Aging',   'Payables grouped by age of the underlying journal line',   ap?.parties, 'Vendor')}
    </div>
  );
};

export default AgingReports;
