import React, { useState, useEffect } from 'react';
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
import { CreateExpenseData, Expense } from '@/types/expenses';
import { useVendors } from '@/hooks/useVendors';
import { useTDSRules } from '@/hooks/useTDSRules';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertCircle } from 'lucide-react';

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
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  expense?: Expense;
  onSuccess?: () => void;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ expense, onSuccess }) => {
  const [expenseDate, setExpenseDate] = useState<Date>();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedVendorTDS, setSelectedVendorTDS] = useState<any>(null);
  const isEditing = !!expense;
  
  const { data: categories = [] } = useExpenseCategories();
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

  const onSubmit = async (data: ExpenseFormData) => {
    try {
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
          tds_amount: Number(data.tds_amount) || 0,
          tds_rule_id: data.tds_rule_id || undefined,
          payment_mode: data.payment_mode,
          reference_number: data.reference_number || undefined,
          bill_number: data.bill_number || undefined,
          notes: data.notes || undefined,
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
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.category_name}
                </SelectItem>
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