import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarIcon, Upload } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCreateExpense, useUpdateExpense, useExpenseCategories } from '@/hooks/useExpenses';
import { CreateExpenseData, Expense, CATEGORY_GROUPS, ExpenseCategory } from '@/types/expenses';
import { useVendors } from '@/hooks/useVendors';
import { useTDSRules } from '@/hooks/useTDSRules';
import { useProjects } from '@/hooks/useProjects';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertCircle, Receipt } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  evaluateRCM,
  RCM_DEFAULT_CATEGORIES,
  VendorGstStatus,
  formatINR,
} from '@/lib/gst';
import { useBusinessData } from '@/hooks/useBusinessData';

const expenseSchema = z.object({
  vendor_name: z.string().min(1, 'Vendor name is required'),
  vendor_id: z.string().optional(),
  expense_date: z.string().min(1, 'Expense date is required'),
  category_name: z.string().min(1, 'Category is required'),
  category_id: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  amount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Amount must be a positive number',
  }),
  tax_amount: z.string().refine((val) => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), {
    message: 'Tax amount must be a non-negative number',
  }).optional(),
  tds_amount: z.string().optional(),
  tds_rule_id: z.string().optional(),
  payment_mode: z.enum(['cash', 'bank', 'credit_card', 'debit_card', 'upi', 'cheque']),
  reference_number: z.string().optional(),
  bill_number: z.string().optional(),
  notes: z.string().optional(),
  project_id: z.string().optional(),
  project_name: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  expense?: Expense;
  onSuccess?: () => void;
  initialData?: Partial<CreateExpenseData> & { expense_date?: string };
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, onSuccess, initialData }) => {
  const [expenseDate, setExpenseDate] = useState<Date>();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVendorTDS, setSelectedVendorTDS] = useState<any>(null);
  const [linkToProject, setLinkToProject] = useState(false);
  const [rcmEnabled, setRcmEnabled] = useState<boolean | undefined>(undefined);
  const [rcmRate, setRcmRate] = useState<number>(18);
  const [vendorGstStatus, setVendorGstStatus] = useState<VendorGstStatus>('unknown');
  const isEditing = !!expense;

  const { getBusinessInfo } = useBusinessData();
  const sellerState = getBusinessInfo()?.state || '';

  const { data: categories = [] } = useExpenseCategories();
  const { data: projects = [] } = useProjects();

  // Group fetched categories using the hardcoded CATEGORY_GROUPS map.
  // Categories from the DB that don't match any group go into "Other".
  const groupedCategories = useMemo(() => {
    const nameToCategory = new Map(categories.map(c => [c.category_name, c]));
    const assigned = new Set<string>();

    const result: { label: string; items: ExpenseCategory[] }[] = CATEGORY_GROUPS.map(g => {
      const items = g.categories
        .map(name => nameToCategory.get(name))
        .filter((c): c is ExpenseCategory => !!c);
      items.forEach(c => assigned.add(c.category_name));
      return { label: g.label, items };
    }).filter(g => g.items.length > 0);

    // Any DB category not in the hardcoded list → append to last group
    const unassigned = categories.filter(c => !assigned.has(c.category_name));
    if (unassigned.length > 0) {
      const otherGroup = result.find(g => g.label === 'Other Expenses');
      if (otherGroup) otherGroup.items.push(...unassigned);
      else result.push({ label: 'Other Expenses', items: unassigned });
    }

    return result;
  }, [categories]);
  const { data: vendors = [] } = useVendors();
  const { data: tdsRules = [] } = useTDSRules();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      expense_date: '',
      payment_mode: 'bank',
      tax_amount: '0',
    },
  });

  const selectedVendorId = watch('vendor_id');
  const selectedCategoryId = watch('category_id');
  const amount = watch('amount');
  const selectedCategoryName = watch('category_name');

  // Auto-suggest RCM when category is in the default RCM list
  const rcmAutoSuggested = !!selectedCategoryName &&
    RCM_DEFAULT_CATEGORIES.includes(selectedCategoryName);

  // Derive vendor state + GST status from vendor record
  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);
  const vendorState = selectedVendor?.state || '';

  // Compute RCM payable live
  const rcmResult = evaluateRCM(
    {
      category: selectedCategoryName || '',
      vendorGstStatus,
      amount: Number(amount) || 0,
      rate: rcmRate,
      explicitRcmFlag: rcmEnabled,
    },
    sellerState,
    vendorState,
  );

  // Auto-calculate TDS when amount changes
  useEffect(() => {
    if (selectedVendorTDS && amount) {
      const amountNum = Number(amount);
      if (amountNum > 0) {
        const tdsAmount = (amountNum * selectedVendorTDS.rate_percentage) / 100;
        setValue('tds_amount', tdsAmount.toFixed(2));
        setValue('tds_rule_id', selectedVendorTDS.id);
      }
    } else {
      setValue('tds_amount', '0');
      setValue('tds_rule_id', undefined);
    }
  }, [amount, selectedVendorTDS, setValue]);

  // Set form values when editing
  useEffect(() => {
    if (expense) {
      setValue('vendor_name', expense.vendor_name);
      setValue('vendor_id', expense.vendor_id || '');
      setValue('expense_date', expense.expense_date);
      setValue('category_name', expense.category_name);
      setValue('category_id', expense.category_id || '');
      setValue('description', expense.description);
      setValue('amount', expense.amount.toString());
      setValue('tax_amount', expense.tax_amount.toString());
      setValue('tds_amount', expense.tds_amount?.toString() || '0');
      setValue('tds_rule_id', expense.tds_rule_id || '');
      setValue('payment_mode', expense.payment_mode);
      setValue('reference_number', expense.reference_number || '');
      setValue('bill_number', expense.bill_number || '');
      setValue('notes', expense.notes || '');
      setExpenseDate(new Date(expense.expense_date));
    }
  }, [expense, setValue]);

  useEffect(() => {
    if (expense || !initialData) return;

    if (initialData.vendor_name) setValue('vendor_name', initialData.vendor_name);
    if (initialData.vendor_id) setValue('vendor_id', initialData.vendor_id);
    if (initialData.expense_date) {
      setValue('expense_date', initialData.expense_date);
      setExpenseDate(new Date(initialData.expense_date));
    }
    if (initialData.category_name) setValue('category_name', initialData.category_name);
    if (initialData.category_id) setValue('category_id', initialData.category_id);
    if (initialData.description) setValue('description', initialData.description);
    if (typeof initialData.amount === 'number') setValue('amount', initialData.amount.toString());
    if (typeof initialData.tax_amount === 'number') setValue('tax_amount', initialData.tax_amount.toString());
    if (typeof initialData.tds_amount === 'number') setValue('tds_amount', initialData.tds_amount.toString());
    if (initialData.payment_mode) setValue('payment_mode', initialData.payment_mode);
    if (initialData.reference_number) setValue('reference_number', initialData.reference_number);
    if (initialData.bill_number) setValue('bill_number', initialData.bill_number);
    if (initialData.notes) setValue('notes', initialData.notes);
  }, [expense, initialData, setValue]);

  const onSubmit = async (data: ExpenseFormData) => {
    try {
      const rcmFields = {
        is_rcm: rcmResult.applicable,
        rcm_rate: rcmResult.applicable ? rcmRate : 0,
        rcm_amount: rcmResult.total_rcm_payable,
        vendor_gst_status: vendorGstStatus,
      };

      if (isEditing && expense) {
        // Update existing expense
        const updateData = {
          vendor_name: data.vendor_name,
          vendor_id: data.vendor_id || undefined,
          expense_date: data.expense_date,
          category_name: data.category_name,
          category_id: data.category_id || undefined,
          description: data.description,
          amount: Number(data.amount),
          tax_amount: Number(data.tax_amount) || 0,
          ...rcmFields,
          tds_amount: Number(data.tds_amount) || 0,
          tds_rule_id: data.tds_rule_id || undefined,
          total_amount: Number(data.amount) + (Number(data.tax_amount) || 0),
          payment_mode: data.payment_mode,
          reference_number: data.reference_number || undefined,
          bill_number: data.bill_number || undefined,
          notes: data.notes || undefined,
        };

        await updateExpense.mutateAsync({ id: expense.id, data: updateData });
      } else {
        // Create new expense
        const expenseData: CreateExpenseData = {
          vendor_name: data.vendor_name,
          vendor_id: data.vendor_id || undefined,
          expense_date: data.expense_date,
          category_name: data.category_name,
          category_id: data.category_id || undefined,
          description: data.description,
          amount: Number(data.amount),
          tax_amount: Number(data.tax_amount) || 0,
          ...rcmFields,
          tds_amount: Number(data.tds_amount) || 0,
          tds_rule_id: data.tds_rule_id || undefined,
          payment_mode: data.payment_mode,
          reference_number: data.reference_number || undefined,
          bill_number: data.bill_number || undefined,
          notes: data.notes || undefined,
          project_id: linkToProject ? (data.project_id || undefined) : undefined,
          project_name: linkToProject ? (data.project_name || undefined) : undefined,
        };

        await createExpense.mutateAsync(expenseData);
      }

      if (!isEditing) {
        reset();
        setExpenseDate(undefined);
      }
      onSuccess?.();
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const handleVendorChange = (vendorId: string) => {
    setValue('vendor_id', vendorId);
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor) {
      setValue('vendor_name', vendor.name);

      // Auto-populate TDS if vendor has TDS enabled
      if (vendor.tds_enabled && vendor.linked_tds_section_id) {
        const tdsRule = tdsRules.find(r => r.id === vendor.linked_tds_section_id);
        setSelectedVendorTDS(tdsRule || null);
      } else {
        setSelectedVendorTDS(null);
      }

      // Infer GST status from vendor record
      if (vendor.gst_number && vendor.gst_number.trim().length >= 15) {
        setVendorGstStatus('registered');
      } else {
        setVendorGstStatus('unregistered');
      }
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    setValue('category_id', categoryId);
    const category = categories.find(c => c.id === categoryId);
    if (category) {
      setValue('category_name', category.category_name);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setExpenseDate(date);
    if (date) {
      setValue('expense_date', format(date, 'yyyy-MM-dd'));
    }
    setIsCalendarOpen(false);
  };

  const isPending = isEditing ? updateExpense.isPending : createExpense.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense Date */}
        <div className="space-y-2">
          <Label htmlFor="expense_date">Expense Date *</Label>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !expenseDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {expenseDate ? format(expenseDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={expenseDate}
                onSelect={handleDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {errors.expense_date && (
            <p className="text-sm text-red-500">{errors.expense_date.message}</p>
          )}
        </div>

        {/* Vendor Selection */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="vendor">Vendor *</Label>
          <Select value={selectedVendorId} onValueChange={handleVendorChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name} {vendor.tds_enabled && '(TDS Applicable)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or enter vendor name manually"
            {...register('vendor_name')}
            className="mt-2"
          />
          {errors.vendor_name && (
            <p className="text-sm text-red-500">{errors.vendor_name.message}</p>
          )}
        </div>

        {/* TDS Information Alert */}
        {selectedVendorTDS && (
          <div className="md:col-span-2">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>TDS Applicable</AlertTitle>
              <AlertDescription>
                <p><strong>Category:</strong> {selectedVendorTDS.category}</p>
                <p><strong>Rate:</strong> {selectedVendorTDS.rate_percentage}%</p>
                {selectedVendorTDS.description && (
                  <p><strong>Description:</strong> {selectedVendorTDS.description}</p>
                )}
                {amount && Number(amount) > 0 && (
                  <p className="mt-2 font-semibold">
                    TDS Amount: ₹{((Number(amount) * selectedVendorTDS.rate_percentage) / 100).toFixed(2)}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select value={selectedCategoryId} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {groupedCategories.map(group => (
                <React.Fragment key={group.label}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                    {group.label}
                  </div>
                  {group.items.map(category => (
                    <SelectItem key={category.id} value={category.id} className="pl-4">
                      {category.category_name}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Or enter category manually"
            {...register('category_name')}
            className="mt-2"
          />
          {errors.category_name && (
            <p className="text-sm text-red-500">{errors.category_name.message}</p>
          )}
        </div>

        {/* Payment Mode */}
        <div className="space-y-2">
          <Label htmlFor="payment_mode">Payment Mode *</Label>
          <Select {...register('payment_mode')} defaultValue="bank">
            <SelectTrigger>
              <SelectValue placeholder="Select payment mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="debit_card">Debit Card</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
            </SelectContent>
          </Select>
          {errors.payment_mode && (
            <p className="text-sm text-red-500">{errors.payment_mode.message}</p>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register('amount')}
          />
          {errors.amount && (
            <p className="text-sm text-red-500">{errors.amount.message}</p>
          )}
        </div>

        {/* Tax Amount */}
        <div className="space-y-2">
          <Label htmlFor="tax_amount">Tax Amount</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register('tax_amount')}
          />
          {errors.tax_amount && (
            <p className="text-sm text-red-500">{errors.tax_amount.message}</p>
          )}
        </div>

        {/* Reverse Charge (RCM) — Feature #12 */}
        <div className="md:col-span-2 space-y-3 border rounded-lg p-3 bg-purple-50/60 border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-700" />
              <Label className="font-medium text-purple-900">
                Reverse Charge (RCM)
              </Label>
              {rcmAutoSuggested && rcmEnabled === undefined && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-200 text-purple-800">
                  Suggested
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="rcm_toggle"
                checked={rcmEnabled ?? rcmAutoSuggested}
                onCheckedChange={(v) => setRcmEnabled(Boolean(v))}
              />
              <Label htmlFor="rcm_toggle" className="text-sm cursor-pointer">
                Business pays GST to govt. (not vendor)
              </Label>
            </div>
          </div>

          {(rcmEnabled ?? rcmAutoSuggested) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">GST Rate (%)</Label>
                <Select
                  value={rcmRate.toString()}
                  onValueChange={(v) => setRcmRate(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                    <SelectItem value="28">28%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vendor GST Status</Label>
                <Select
                  value={vendorGstStatus}
                  onValueChange={(v) => setVendorGstStatus(v as VendorGstStatus)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="unregistered">Unregistered</SelectItem>
                    <SelectItem value="composition">Composition</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">RCM Payable</Label>
                <div className="h-9 px-3 rounded-md border bg-white flex items-center text-sm font-medium text-purple-900">
                  {formatINR(rcmResult.total_rcm_payable)}
                </div>
              </div>
              <div className="md:col-span-3 text-xs text-purple-800 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {rcmResult.reason}
                  {rcmResult.applicable && (
                    <>
                      {' — '}
                      {rcmResult.igst > 0
                        ? `IGST ${formatINR(rcmResult.igst)}`
                        : `CGST ${formatINR(rcmResult.cgst)} + SGST ${formatINR(rcmResult.sgst)}`}
                      . Post to RCM liability ledger on save.
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* TDS Amount - Only show if TDS is applicable */}
        {selectedVendorTDS && (
          <div className="space-y-2">
            <Label htmlFor="tds_amount">TDS Amount (Auto-calculated)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('tds_amount')}
              disabled
              className="bg-muted"
            />
          </div>
        )}

        {/* Reference Number */}
        <div className="space-y-2">
          <Label htmlFor="reference_number">Reference Number</Label>
          <Input
            placeholder="Transaction/Reference number"
            {...register('reference_number')}
          />
        </div>

        {/* Bill Number */}
        <div className="space-y-2">
          <Label htmlFor="bill_number">Bill Number</Label>
          <Input
            placeholder="Bill/Invoice number"
            {...register('bill_number')}
          />
        </div>

        {/* Link to Project */}
        <div className="space-y-3 md:col-span-2 border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Link to Project?</Label>
            <div className="flex items-center gap-3 text-sm">
              <span className={!linkToProject ? 'font-semibold' : 'text-muted-foreground'}>No</span>
              <Switch
                checked={linkToProject}
                onCheckedChange={(v) => {
                  setLinkToProject(v);
                  if (!v) {
                    setValue('project_id', '');
                    setValue('project_name', '');
                  }
                }}
              />
              <span className={linkToProject ? 'font-semibold' : 'text-muted-foreground'}>Yes</span>
            </div>
          </div>
          {linkToProject && (
            <Select
              onValueChange={(id) => {
                setValue('project_id', id);
                const p = projects.find(p => p.id === id);
                if (p) setValue('project_name', p.project_name);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No projects found</div>
                ) : (
                  projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_name}
                      {p.client_name ? ` — ${p.client_name}` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          placeholder="Describe the expense..."
          {...register('description')}
          rows={2}
        />
        {errors.description && (
          <p className="text-sm text-red-500">{errors.description.message}</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          placeholder="Additional notes or comments..."
          {...register('notes')}
          rows={2}
        />
      </div>

      {/* Bill Attachment */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <p>Drag & drop bills or receipts here</p>
              <p className="text-xs">Supports PDF, JPG, PNG (Max 10MB)</p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled>
              Browse Files (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset();
            setExpenseDate(undefined);
            onSuccess?.();
          }}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isPending}
        >
          {isPending ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Expense' : 'Create Expense')}
        </Button>
      </div>
    </form>
  );
};

export default ExpenseForm;
