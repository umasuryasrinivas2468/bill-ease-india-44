import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Edit2, Trash2, RefreshCw, RepeatIcon, PauseCircle, PlayCircle, CalendarClock } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { RecurringExpense, FREQUENCY_LABELS } from '@/types/expenses';
import {
  useRecurringExpenses,
  useDeleteRecurringExpense,
  useUpdateRecurringExpense,
  useGenerateRecurringExpenses,
} from '@/hooks/useRecurringExpenses';
import RecurringExpenseForm from './RecurringExpenseForm';

const STATUS_COLORS: Record<string, string> = {
  overdue:  'bg-red-100 text-red-700 border-red-300',
  due_today:'bg-orange-100 text-orange-700 border-orange-300',
  upcoming: 'bg-green-100 text-green-700 border-green-300',
  inactive: 'bg-gray-100 text-gray-500 border-gray-300',
};

function getDueStatus(rec: RecurringExpense): { label: string; color: string } {
  if (!rec.is_active) return { label: 'Inactive', color: STATUS_COLORS.inactive };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseISO(rec.next_due_date);
  const diff = differenceInDays(due, today);
  if (diff < 0)  return { label: `Overdue by ${Math.abs(diff)}d`, color: STATUS_COLORS.overdue };
  if (diff === 0) return { label: 'Due Today', color: STATUS_COLORS.due_today };
  return { label: `Due in ${diff}d`, color: STATUS_COLORS.upcoming };
}

const RecurringExpensesList: React.FC = () => {
  const { data: items = [], isLoading } = useRecurringExpenses();
  const deleteRec = useDeleteRecurringExpense();
  const updateRec = useUpdateRecurringExpense();
  const generate  = useGenerateRecurringExpenses();

  const [editItem, setEditItem] = useState<RecurringExpense | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const toggleActive = (rec: RecurringExpense) => {
    updateRec.mutate({ id: rec.id, data: { is_active: !rec.is_active } });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading recurring expenses...
        </CardContent>
      </Card>
    );
  }

  const overdueCount  = items.filter(i => i.is_active && parseISO(i.next_due_date) < new Date()).length;
  const activeCount   = items.filter(i => i.is_active).length;
  const monthlyTotal  = items
    .filter(i => i.is_active)
    .reduce((sum, i) => {
      const multipliers: Record<string, number> = { daily: 30, weekly: 4.33, monthly: 1, quarterly: 1/3, yearly: 1/12 };
      return sum + Number(i.total_amount) * (multipliers[i.frequency] || 1);
    }, 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RepeatIcon className="h-4 w-4" /> Active Recurring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">{items.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-orange-500" /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : ''}`}>{overdueCount}</div>
            <p className="text-xs text-muted-foreground">Need to be generated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Est. Monthly Outflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{monthlyTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-muted-foreground">Across all active recurring</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recurring Expenses</CardTitle>
              <CardDescription>Auto-scheduled expenses that repeat on a set frequency</CardDescription>
            </div>
            {overdueCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="border-orange-400 text-orange-600 hover:bg-orange-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${generate.isPending ? 'animate-spin' : ''}`} />
                Generate {overdueCount} Overdue
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RepeatIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No recurring expenses set up yet.</p>
              <p className="text-sm mt-1">Use "Add Recurring" to schedule repeating expenses like rent, subscriptions, EMIs.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(rec => {
                  const { label, color } = getDueStatus(rec);
                  return (
                    <TableRow key={rec.id} className={!rec.is_active ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="font-medium">{rec.name}</div>
                        <div className="text-xs text-muted-foreground">{rec.vendor_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{rec.category_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">₹{Number(rec.total_amount).toLocaleString('en-IN')}</div>
                        {rec.tax_amount > 0 && (
                          <div className="text-xs text-muted-foreground">Tax: ₹{Number(rec.tax_amount).toLocaleString('en-IN')}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{FREQUENCY_LABELS[rec.frequency]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{format(parseISO(rec.next_due_date), 'dd MMM yyyy')}</div>
                        {rec.last_generated_date && (
                          <div className="text-xs text-muted-foreground">
                            Last: {format(parseISO(rec.last_generated_date), 'dd MMM yyyy')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${color}`}>{label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={rec.is_active ? 'Pause' : 'Activate'}
                            onClick={() => toggleActive(rec)}
                          >
                            {rec.is_active
                              ? <PauseCircle className="h-4 w-4 text-orange-500" />
                              : <PlayCircle className="h-4 w-4 text-green-500" />
                            }
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit"
                            onClick={() => { setEditItem(rec); setEditOpen(true); }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Delete">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Recurring Expense?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove "{rec.name}" from recurring expenses. Already-generated expenses will not be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => deleteRec.mutate(rec.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Recurring Expense</DialogTitle>
          </DialogHeader>
          {editItem && (
            <RecurringExpenseForm
              existing={editItem}
              onSuccess={() => { setEditOpen(false); setEditItem(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringExpensesList;
