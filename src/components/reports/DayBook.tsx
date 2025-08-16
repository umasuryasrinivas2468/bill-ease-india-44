
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useJournalsWithLines } from '@/hooks/useJournals';
import { DateRangePicker } from '@/components/DateRangePicker';

type DayBookEntry = {
  date: string;
  particulars: string;
  voucherType: string;
  debit: number;
  credit: number;
  balance: number;
};

const DayBook: React.FC = () => {
  const { data } = useJournalsWithLines();
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const entries = React.useMemo<DayBookEntry[]>(() => {
    if (!data) return [];
    const { journals, lines, accounts } = data;

    const cashBankIds = accounts
      .filter(a => ['cash', 'bank'].includes(String(a.account_type || '').toLowerCase()))
      .map(a => a.id);

    const byJournalId: Record<string, { journal: any; lines: any[] }> = {};
    journals.forEach(j => {
      byJournalId[j.id] = { journal: j, lines: [] };
    });
    lines.forEach(l => {
      if (!byJournalId[l.journal_id]) return;
      byJournalId[l.journal_id].lines.push(l);
    });

    const filtered: DayBookEntry[] = [];
    Object.values(byJournalId).forEach(({ journal, lines: jLines }) => {
      const jDate = new Date(journal.journal_date);
      if (startDate && jDate < startDate) return;
      if (endDate && jDate > endDate) return;

      jLines.forEach(line => {
        if (!line.account_id) return;
        if (!cashBankIds.includes(line.account_id)) return;
        filtered.push({
          date: journal.journal_date,
          particulars: journal.narration || line.line_narration || 'Entry',
          voucherType: 'Journal',
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          balance: 0,
        });
      });
    });

    // sort by date asc
    filtered.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // running balance per day
    let running = 0;
    let lastDay = '';
    return filtered.map(row => {
      const day = row.date;
      if (day !== lastDay) {
        // reset daily running if "per day" balance is intended
        running = 0;
        lastDay = day;
      }
      running += row.debit - row.credit;
      return { ...row, balance: running };
    });
  }, [data, startDate, endDate]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
          <div>
            <CardTitle>Day Book</CardTitle>
            <CardDescription>All cash & bank transactions, day-wise</CardDescription>
          </div>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-muted-foreground text-sm">No transactions in the selected range.</div>
        ) : (
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Voucher Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>{e.particulars}</TableCell>
                    <TableCell>{e.voucherType}</TableCell>
                    <TableCell className="text-right">₹{e.debit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{e.credit.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{e.balance.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DayBook;
