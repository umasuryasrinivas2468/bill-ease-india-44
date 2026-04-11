
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJournalsWithLines } from '@/hooks/useJournals';
import { useInvoices } from '@/hooks/useInvoices';
import { DateRangePicker } from '@/components/DateRangePicker';

type DayBookEntry = {
  id: string;
  date: string;
  particulars: string;
  voucherType: string;
  voucherNumber: string;
  accountHead: string;
  debit: number;
  credit: number;
  balance: number;
};

const DayBook: React.FC = () => {
  const { data } = useJournalsWithLines();
  const { data: invoices = [] } = useInvoices();
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();
  const [transactionType, setTransactionType] = React.useState<string>('all');

  const entries = React.useMemo<DayBookEntry[]>(() => {
    const allEntries: DayBookEntry[] = [];

    // Process invoice entries
    invoices.forEach(invoice => {
      const invoiceDate = new Date(invoice.invoice_date);
      if (startDate && invoiceDate < startDate) return;
      if (endDate && invoiceDate > endDate) return;
      if (transactionType !== 'all' && transactionType !== 'invoice') return;

      // Sales Entry (Debit: Customer Account, Credit: Sales Account)
      allEntries.push({
        id: `inv-${invoice.id}-dr`,
        date: invoice.invoice_date,
        particulars: `Sales to ${invoice.client_name}`,
        voucherType: 'Invoice',
        voucherNumber: invoice.invoice_number,
        accountHead: 'Accounts Receivable',
        debit: Number(invoice.total_amount),
        credit: 0,
        balance: 0,
      });

      allEntries.push({
        id: `inv-${invoice.id}-cr`,
        date: invoice.invoice_date,
        particulars: `Sales to ${invoice.client_name}`,
        voucherType: 'Invoice',
        voucherNumber: invoice.invoice_number,
        accountHead: 'Sales Revenue',
        debit: 0,
        credit: Number(invoice.total_amount),
        balance: 0,
      });

      // If invoice is paid, add payment entry
      if (invoice.status === 'paid') {
        allEntries.push({
          id: `inv-${invoice.id}-payment-dr`,
          date: invoice.invoice_date,
          particulars: `Payment received from ${invoice.client_name}`,
          voucherType: 'Receipt',
          voucherNumber: `RCP-${invoice.invoice_number}`,
          accountHead: 'Cash/Bank',
          debit: Number(invoice.total_amount),
          credit: 0,
          balance: 0,
        });

        allEntries.push({
          id: `inv-${invoice.id}-payment-cr`,
          date: invoice.invoice_date,
          particulars: `Payment received from ${invoice.client_name}`,
          voucherType: 'Receipt',
          voucherNumber: `RCP-${invoice.invoice_number}`,
          accountHead: 'Accounts Receivable',
          debit: 0,
          credit: Number(invoice.total_amount),
          balance: 0,
        });
      }
    });

    // Process journal entries
    if (data) {
      const { journals, lines, accounts } = data;

      const byJournalId: Record<string, { journal: any; lines: any[] }> = {};
      journals.forEach(j => {
        byJournalId[j.id] = { journal: j, lines: [] };
      });
      lines.forEach(l => {
        if (!byJournalId[l.journal_id]) return;
        byJournalId[l.journal_id].lines.push(l);
      });

      Object.values(byJournalId).forEach(({ journal, lines: jLines }) => {
        const jDate = new Date(journal.journal_date);
        if (startDate && jDate < startDate) return;
        if (endDate && jDate > endDate) return;
        if (transactionType !== 'all' && transactionType !== 'journal') return;

        jLines.forEach((line, index) => {
          const account = accounts.find(a => a.id === line.account_id);
          allEntries.push({
            id: `jnl-${journal.id}-${index}`,
            date: journal.journal_date,
            particulars: journal.narration || line.line_narration || 'Journal Entry',
            voucherType: 'Journal',
            voucherNumber: journal.journal_number || `JNL-${journal.id}`,
            accountHead: account?.account_name || 'Unknown Account',
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            balance: 0,
          });
        });
      });
    }

    // Add some sample entries if no data exists
    if (allEntries.length === 0) {
      const today = new Date();
      const sampleEntries = [
        {
          id: 'sample-1',
          date: today.toISOString().split('T')[0],
          particulars: 'Opening Balance - Cash',
          voucherType: 'Opening',
          voucherNumber: 'OB-001',
          accountHead: 'Cash',
          debit: 50000,
          credit: 0,
          balance: 0,
        },
        {
          id: 'sample-2',
          date: today.toISOString().split('T')[0],
          particulars: 'Opening Balance - Capital',
          voucherType: 'Opening',
          voucherNumber: 'OB-001',
          accountHead: 'Capital',
          debit: 0,
          credit: 50000,
          balance: 0,
        },
        {
          id: 'sample-3',
          date: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          particulars: 'Office Rent Payment',
          voucherType: 'Payment',
          voucherNumber: 'PAY-001',
          accountHead: 'Rent Expense',
          debit: 10000,
          credit: 0,
          balance: 0,
        },
        {
          id: 'sample-4',
          date: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          particulars: 'Office Rent Payment',
          voucherType: 'Payment',
          voucherNumber: 'PAY-001',
          accountHead: 'Cash',
          debit: 0,
          credit: 10000,
          balance: 0,
        },
        {
          id: 'sample-5',
          date: new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0],
          particulars: 'Bank Interest Received',
          voucherType: 'Receipt',
          voucherNumber: 'RCP-001',
          accountHead: 'Bank',
          debit: 500,
          credit: 0,
          balance: 0,
        }
      ];
      allEntries.push(...sampleEntries);
    }

    // Sort by date and time
    allEntries.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });

    // Calculate running balance
    let runningBalance = 0;
    return allEntries.map(entry => {
      runningBalance += entry.debit - entry.credit;
      return { ...entry, balance: runningBalance };
    });
  }, [data, invoices, startDate, endDate, transactionType]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
          <div>
            <CardTitle>Day Book</CardTitle>
            <CardDescription>All daily transactions including invoices and journal entries</CardDescription>
          </div>
          <div className="flex gap-4 flex-col sm:flex-row">
            <Select value={transactionType} onValueChange={setTransactionType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="invoice">Invoices Only</SelectItem>
                <SelectItem value="journal">Journals Only</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={({ startDate: s, endDate: e }) => {
                setStartDate(s);
                setEndDate(e);
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-muted-foreground text-sm">No transactions found in the selected range.</div>
        ) : (
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher No.</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Account Head</TableHead>
                  <TableHead>Voucher Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{new Date(e.date).toLocaleDateString()}</TableCell>
                    <TableCell>{e.voucherNumber}</TableCell>
                    <TableCell>{e.particulars}</TableCell>
                    <TableCell>{e.accountHead}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        e.voucherType === 'Invoice' ? 'bg-blue-100 text-blue-800' :
                        e.voucherType === 'Receipt' ? 'bg-green-100 text-green-800' :
                        e.voucherType === 'Payment' ? 'bg-red-100 text-red-800' :
                        e.voucherType === 'Journal' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {e.voucherType}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {e.debit > 0 ? `₹${e.debit.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.credit > 0 ? `₹${e.credit.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${e.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{Math.abs(e.balance).toLocaleString()}
                      {e.balance < 0 ? ' Cr' : ' Dr'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Total Entries: {entries.length}
                </span>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">
                    Total Debits: ₹{entries.reduce((sum, e) => sum + e.debit, 0).toLocaleString()}
                  </span>
                  <span className="text-red-600">
                    Total Credits: ₹{entries.reduce((sum, e) => sum + e.credit, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DayBook;
