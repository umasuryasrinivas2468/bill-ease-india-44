import { useMemo } from 'react';
import { addDays, differenceInCalendarDays, format, isBefore, parseISO } from 'date-fns';
import { useInvoices } from '@/hooks/useInvoices';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { occurrencesInRange } from '@/utils/complianceData';

export type NotificationTone = 'critical' | 'warning' | 'info' | 'success';
export type NotificationKind = 'invoice' | 'purchase_bill' | 'recurring_expense' | 'compliance';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  title: string;
  description: string;
  date: string;
  relativeLabel: string;
  route: string;
}

const COMPLIANCE_STORAGE_KEY = 'complianceFiled:v1';

const getFiledCompliance = (): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COMPLIANCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const getRelativeLabel = (date: string, today: Date) => {
  const parsed = parseISO(date);
  const delta = differenceInCalendarDays(parsed, today);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta > 1) return `In ${delta} days`;
  if (delta === -1) return '1 day overdue';
  return `${Math.abs(delta)} days overdue`;
};

const compareNotifications = (a: NotificationItem, b: NotificationItem) => {
  const toneRank: Record<NotificationTone, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };

  return (
    toneRank[a.tone] - toneRank[b.tone] ||
    new Date(a.date).getTime() - new Date(b.date).getTime() ||
    a.title.localeCompare(b.title)
  );
};

export const useNotificationsFeed = () => {
  const invoicesQuery = useInvoices();
  const purchaseBillsQuery = usePurchaseBills();
  const recurringExpensesQuery = useRecurringExpenses();

  const items = useMemo(() => {
    const today = new Date();
    const todayIso = format(today, 'yyyy-MM-dd');
    const soonLimit = format(addDays(today, 7), 'yyyy-MM-dd');
    const notifications: NotificationItem[] = [];

    for (const invoice of invoicesQuery.data || []) {
      if (invoice.status === 'paid' || !invoice.due_date) continue;

      const tone: NotificationTone =
        invoice.due_date < todayIso || invoice.status === 'overdue'
          ? 'critical'
          : invoice.due_date === todayIso
            ? 'warning'
            : invoice.due_date <= soonLimit
              ? 'info'
              : 'success';

      if (tone === 'success') continue;

      notifications.push({
        id: `invoice-${invoice.id}`,
        kind: 'invoice',
        tone,
        title:
          tone === 'critical'
            ? `Invoice ${invoice.invoice_number} is overdue`
            : tone === 'warning'
              ? `Invoice ${invoice.invoice_number} is due today`
              : `Invoice ${invoice.invoice_number} is due soon`,
        description: `${invoice.client_name} | Rs ${Number(invoice.total_amount || 0).toLocaleString('en-IN')} | Due ${format(parseISO(invoice.due_date), 'dd MMM yyyy')}`,
        date: invoice.due_date,
        relativeLabel: getRelativeLabel(invoice.due_date, today),
        route: '/invoices',
      });
    }

    for (const bill of purchaseBillsQuery.data || []) {
      if (bill.status === 'paid' || !bill.due_date) continue;
      if (bill.due_date > soonLimit && bill.status !== 'overdue') continue;

      const tone: NotificationTone =
        bill.due_date < todayIso || bill.status === 'overdue'
          ? 'critical'
          : bill.due_date === todayIso
            ? 'warning'
            : 'info';

      notifications.push({
        id: `purchase-bill-${bill.id}`,
        kind: 'purchase_bill',
        tone,
        title:
          tone === 'critical'
            ? `Purchase bill ${bill.bill_number} is overdue`
            : tone === 'warning'
              ? `Purchase bill ${bill.bill_number} is due today`
              : `Purchase bill ${bill.bill_number} is due soon`,
        description: `${bill.vendor_name} | Rs ${Number(bill.total_amount || 0).toLocaleString('en-IN')} | Due ${format(parseISO(bill.due_date), 'dd MMM yyyy')}`,
        date: bill.due_date,
        relativeLabel: getRelativeLabel(bill.due_date, today),
        route: '/purchase-bills',
      });
    }

    for (const recurring of recurringExpensesQuery.data || []) {
      if (!recurring.is_active || !recurring.next_due_date) continue;
      if (recurring.next_due_date > soonLimit) continue;

      const tone: NotificationTone =
        recurring.next_due_date < todayIso
          ? 'critical'
          : recurring.next_due_date === todayIso
            ? 'warning'
            : 'info';

      notifications.push({
        id: `recurring-${recurring.id}`,
        kind: 'recurring_expense',
        tone,
        title:
          tone === 'critical'
            ? `${recurring.name} recurring expense is overdue`
            : tone === 'warning'
              ? `${recurring.name} recurring expense is due today`
              : `${recurring.name} recurring expense is coming up`,
        description: `${recurring.vendor_name} | Rs ${Number(recurring.total_amount || 0).toLocaleString('en-IN')} | Next due ${format(parseISO(recurring.next_due_date), 'dd MMM yyyy')}`,
        date: recurring.next_due_date,
        relativeLabel: getRelativeLabel(recurring.next_due_date, today),
        route: '/expenses',
      });
    }

    const filedMap = getFiledCompliance();
    const complianceWindow = occurrencesInRange(addDays(today, -7), addDays(today, 14));

    for (const occurrence of complianceWindow) {
      if (filedMap[occurrence.id]) continue;
      const occurrenceDate = parseISO(occurrence.date);
      const tone: NotificationTone = isBefore(occurrenceDate, today)
        ? 'critical'
        : occurrence.date === todayIso
          ? 'warning'
          : 'info';

      notifications.push({
        id: `compliance-${occurrence.id}`,
        kind: 'compliance',
        tone,
        title:
          tone === 'critical'
            ? `${occurrence.title} compliance is overdue`
            : tone === 'warning'
              ? `${occurrence.title} compliance is due today`
              : `${occurrence.title} compliance is coming up`,
        description: `${occurrence.category} | Due ${format(occurrenceDate, 'dd MMM yyyy')}${occurrence.note ? ` | ${occurrence.note}` : ''}`,
        date: occurrence.date,
        relativeLabel: getRelativeLabel(occurrence.date, today),
        route: '/compliance',
      });
    }

    return notifications.sort(compareNotifications);
  }, [invoicesQuery.data, purchaseBillsQuery.data, recurringExpensesQuery.data]);

  const summary = useMemo(() => ({
    total: items.length,
    critical: items.filter((item) => item.tone === 'critical').length,
    warning: items.filter((item) => item.tone === 'warning').length,
    info: items.filter((item) => item.tone === 'info').length,
  }), [items]);

  return {
    items,
    summary,
    isLoading: invoicesQuery.isLoading || purchaseBillsQuery.isLoading || recurringExpensesQuery.isLoading,
  };
};

