import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Receipt, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useExpensesByProject } from '@/hooks/useExpenses';

interface Props {
  projectId: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', bank: 'Bank', credit_card: 'Credit Card',
  debit_card: 'Debit Card', upi: 'UPI', cheque: 'Cheque',
};

const ProjectExpenses: React.FC<Props> = ({ projectId }) => {
  const [open, setOpen] = useState(false);
  const { data: expenses = [], isLoading } = useExpensesByProject(open ? projectId : undefined);

  const total = expenses.reduce((s, e) => s + Number(e.total_amount), 0);

  return (
    <div className="border-t mt-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Project Expenses
        </span>
        <span className="flex items-center gap-2">
          {!open && total > 0 && (
            <span className="text-xs font-semibold text-foreground">
              ₹{total.toLocaleString('en-IN')}
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          ) : expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No expenses linked to this project yet.</p>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-red-500" />
                Total Project Expenses:&nbsp;
                <span className="text-red-600">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>

              {/* Table */}
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs">Mode</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(exp => (
                      <TableRow key={exp.id}>
                        <TableCell className="text-xs">
                          {format(parseISO(exp.expense_date), 'dd MMM yy')}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate" title={exp.description}>
                          {exp.description}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {exp.category_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {PAYMENT_LABELS[exp.payment_mode] || exp.payment_mode}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          ₹{Number(exp.total_amount).toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              exp.status === 'posted' ? 'bg-green-50 text-green-700 border-green-300' :
                              exp.status === 'approved' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                              exp.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-300' :
                              'bg-yellow-50 text-yellow-700 border-yellow-300'
                            }`}
                          >
                            {exp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectExpenses;
