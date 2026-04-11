import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useExpenseCategories } from '@/hooks/useExpenses';
import { useVendors } from '@/hooks/useVendors';
import { useCreateRecurringExpense, useUpdateRecurringExpense } from '@/hooks/useRecurringExpenses';
import { RecurringExpense, CreateRecurringExpenseData, FREQUENCY_LABELS, CATEGORY_GROUPS, ExpenseCategory } from '@/types/expenses';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  vendor_name: z.string().min(1, 'Vendor is required'),
  vendor_id: z.string().optional(),
  category_name: z.string().min(1, 'Category is required'),
  category_id: z.string().optional(),
  amount: z.string().refine(v => !isNaN(Number(v)) && Number(v) > 0, { message: 'Must be positive' }),
  tax_amount: z.string().optional(),
  payment_mode: z.enum(['cash', 'bank', 'credit_card', 'debit_card', 'upi', 'cheque']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  start_date: z.string().min(1, 'Start date required'),
  end_date: z.string().optional(),
  next_due_date: z.string().min(1, 'Next due date required'),
  is_active: z.boolean(),
  description: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  existing?: RecurringExpense;
  onSuccess?: () => void;
}

const RecurringExpenseForm: React.FC<Props> = ({ existing, onSuccess }) => {
  const isEditing = !!existing;
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [nextDueDate, setNextDueDate] = useState<Date>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);

  const { data: categories = [] } = useExpenseCategories();
  const { data: vendors = [] } = useVendors();
  const create = useCreateRecurringExpense();
  const update = useUpdateRecurringExpense();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_mode: 'bank',
      frequency: 'monthly',
      is_active: true,
      tax_amount: '0',
    },
  });

  const selectedVendorId = watch('vendor_id');
  const selectedCategoryId = watch('category_id');
  const isActive = watch('is_active');

  useEffect(() => {
    if (!existing) return;
    setValue('name', existing.name);
    setValue('vendor_name', existing.vendor_name);
    setValue('vendor_id', existing.vendor_id || '');
    setValue('category_name', existing.category_name);
    setValue('category_id', existing.category_id || '');
    setValue('amount', existing.amount.toString());
    setValue('tax_amount', existing.tax_amount.toString());
    setValue('payment_mode', existing.payment_mode);
    setValue('frequency', existing.frequency);
    setValue('start_date', existing.start_date);
    setValue('end_date', existing.end_date || '');
    setValue('next_due_date', existing.next_due_date);
    setValue('is_active', existing.is_active);
    setValue('description', existing.description || '');
    setValue('reference_number', existing.reference_number || '');
    setValue('notes', existing.notes || '');
    setStartDate(new Date(existing.start_date));
    if (existing.end_date) setEndDate(new Date(existing.end_date));
    setNextDueDate(new Date(existing.next_due_date));
  }, [existing, setValue]);

  // Group fetched categories using the hardcoded CATEGORY_GROUPS map
  const groupedCategories = React.useMemo(() => {
    const nameToCategory = new Map(categories.map(c => [c.category_name, c]));
    const assigned = new Set<string>();

    const result: { label: string; items: ExpenseCategory[] }[] = CATEGORY_GROUPS.map(g => {
      const items = g.categories
        .map(name => nameToCategory.get(name))
        .filter((c): c is ExpenseCategory => !!c);
      items.forEach(c => assigned.add(c.category_name));
      return { label: g.label, items };
    }).filter(g => g.items.length > 0);

    const unassigned = categories.filter(c => !assigned.has(c.category_name));
    if (unassigned.length > 0) {
      const otherGroup = result.find(g => g.label === 'Other Expenses');
      if (otherGroup) otherGroup.items.push(...unassigned);
      else result.push({ label: 'Other Expenses', items: unassigned });
    }
    return result;
  }, [categories]);

  const onSubmit = async (data: FormData) => {
    const payload: CreateRecurringExpenseData = {
      name: data.name,
      vendor_name: data.vendor_name,
      vendor_id: data.vendor_id || undefined,
      category_name: data.category_name,
      category_id: data.category_id || undefined,
      amount: Number(data.amount),
      tax_amount: Number(data.tax_amount || 0),
      total_amount: Number(data.amount) + Number(data.tax_amount || 0),
      payment_mode: data.payment_mode,
      frequency: data.frequency,
      start_date: data.start_date,
      end_date: data.end_date || undefined,
      next_due_date: data.next_due_date,
      is_active: data.is_active,
      description: data.description || undefined,
      reference_number: data.reference_number || undefined,
      notes: data.notes || undefined,
    };

    if (isEditing && existing) {
      await update.mutateAsync({ id: existing.id, data: payload });
    } else {
      await create.mutateAsync(payload);
      reset();
      setStartDate(undefined);
      setEndDate(undefined);
      setNextDueDate(undefined);
    }
    onSuccess?.();
  };

  const isPending = create.isPending || update.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input placeholder="e.g. Monthly Office Rent" {...register('name')} />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vendor */}
        <div className="space-y-2">
          <Label>Vendor *</Label>
          <Select value={selectedVendorId} onValueChange={id => {
            setValue('vendor_id', id);
            const v = vendors.find(v => v.id === id);
            if (v) setValue('vendor_name', v.name);
          }}>
            <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
            <SelectContent>
              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Or type vendor name" {...register('vendor_name')} className="mt-1" />
          {errors.vendor_name && <p className="text-sm text-red-500">{errors.vendor_name.message}</p>}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Category *</Label>
          <Select value={selectedCategoryId} onValueChange={id => {
            setValue('category_id', id);
            const c = categories.find(c => c.id === id);
            if (c) setValue('category_name', c.category_name);
          }}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {groupedCategories.map(group => (
                <React.Fragment key={group.label}>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted">
                    {group.label}
                  </div>
                  {group.items.map(c => (
                    <SelectItem key={c.id} value={c.id} className="pl-4">{c.category_name}</SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
          {errors.category_name && <p className="text-sm text-red-500">{errors.category_name.message}</p>}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register('amount')} />
          {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
        </div>

        {/* Tax Amount */}
        <div className="space-y-2">
          <Label>Tax Amount (GST etc.)</Label>
          <Input type="number" step="0.01" placeholder="0.00" {...register('tax_amount')} />
        </div>

        {/* Payment Mode */}
        <div className="space-y-2">
          <Label>Payment Mode *</Label>
          <Select defaultValue="bank" onValueChange={v => setValue('payment_mode', v as FormData['payment_mode'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="debit_card">Debit Card</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Frequency */}
        <div className="space-y-2">
          <Label>Frequency *</Label>
          <Select defaultValue="monthly" onValueChange={v => setValue('frequency', v as FormData['frequency'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start Date */}
        <div className="space-y-2">
          <Label>Start Date *</Label>
          <Popover open={startOpen} onOpenChange={setStartOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={startDate} onSelect={d => {
                setStartDate(d);
                if (d) { setValue('start_date', format(d, 'yyyy-MM-dd')); setValue('next_due_date', format(d, 'yyyy-MM-dd')); setNextDueDate(d); }
                setStartOpen(false);
              }} initialFocus />
            </PopoverContent>
          </Popover>
          {errors.start_date && <p className="text-sm text-red-500">{errors.start_date.message}</p>}
        </div>

        {/* Next Due Date */}
        <div className="space-y-2">
          <Label>Next Due Date *</Label>
          <Popover open={nextOpen} onOpenChange={setNextOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !nextDueDate && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {nextDueDate ? format(nextDueDate, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={nextDueDate} onSelect={d => {
                setNextDueDate(d);
                if (d) setValue('next_due_date', format(d, 'yyyy-MM-dd'));
                setNextOpen(false);
              }} initialFocus />
            </PopoverContent>
          </Popover>
          {errors.next_due_date && <p className="text-sm text-red-500">{errors.next_due_date.message}</p>}
        </div>

        {/* End Date */}
        <div className="space-y-2 md:col-span-2">
          <Label>End Date (leave blank for no end)</Label>
          <Popover open={endOpen} onOpenChange={setEndOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, 'PPP') : 'No end date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={endDate} onSelect={d => {
                setEndDate(d);
                if (d) setValue('end_date', format(d, 'yyyy-MM-dd'));
                else setValue('end_date', '');
                setEndOpen(false);
              }} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea placeholder="Describe this recurring expense..." {...register('description')} rows={2} />
      </div>

      {/* Reference Number */}
      <div className="space-y-2">
        <Label>Reference Number</Label>
        <Input placeholder="Contract / reference number" {...register('reference_number')} />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea placeholder="Additional notes..." {...register('notes')} rows={2} />
      </div>

      {/* Active Toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={isActive}
          onCheckedChange={v => setValue('is_active', v)}
          id="is_active"
        />
        <Label htmlFor="is_active">Active (will auto-generate expenses when due)</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => { reset(); onSuccess?.(); }}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update' : 'Create Recurring Expense')}
        </Button>
      </div>
    </form>
  );
};

export default RecurringExpenseForm;
