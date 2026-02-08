import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calculator, Plus, IndianRupee } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useClients } from '@/hooks/useClients';
import { useTDSRules, calculateTDS } from '@/hooks/useTDSRules';
import { useCreateTDSTransaction } from '@/hooks/useTDSTransactions';
import type { CreateTDSTransactionData } from '@/types/tds';
import { format } from 'date-fns';

interface TDSTransactionFormData extends Omit<CreateTDSTransactionData, 'tds_rate'> {
  tds_rule_id: string;
}

interface TDSCalculationProps {
  amount: number;
  rate: number;
}

const TDSCalculator = ({ amount, rate }: TDSCalculationProps) => {
  const { tdsAmount, netPayable } = calculateTDS(amount, rate);

  return (
    <div className="p-4 bg-gray-50 rounded-lg space-y-2">
      <h4 className="font-medium flex items-center gap-2">
        <Calculator className="h-4 w-4" />
        TDS Calculation
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div className="text-center p-2 bg-white rounded border">
          <div className="text-lg font-semibold text-blue-600">
            ₹{amount.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Transaction Amount</div>
        </div>
        <div className="text-center p-2 bg-white rounded border">
          <div className="text-lg font-semibold text-red-600">
            ₹{tdsAmount.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">TDS @ {rate}%</div>
        </div>
        <div className="text-center p-2 bg-white rounded border">
          <div className="text-lg font-semibold text-green-600">
            ₹{netPayable.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Net Payable</div>
        </div>
      </div>
    </div>
  );
};

const TDSTransactionForm = ({ trigger }: { trigger?: React.ReactNode }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTDSRule, setSelectedTDSRule] = useState<any>(null);
  const [transactionAmount, setTransactionAmount] = useState(0);

  const { data: clients = [] } = useClients();
  const { data: tdsRules = [] } = useTDSRules();
  const createTDSTransaction = useCreateTDSTransaction();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TDSTransactionFormData>();
  
  const watchedAmount = watch('transaction_amount');
  const watchedTDSRule = watch('tds_rule_id');

  useEffect(() => {
    const amount = Number(watchedAmount) || 0;
    setTransactionAmount(amount);
  }, [watchedAmount]);

  useEffect(() => {
    const rule = tdsRules.find(r => r.id === watchedTDSRule);
    setSelectedTDSRule(rule);
  }, [watchedTDSRule, tdsRules]);

  const handleCreateTransaction = async (data: TDSTransactionFormData) => {
    try {
      const selectedRule = tdsRules.find(r => r.id === data.tds_rule_id);
      if (!selectedRule) {
        throw new Error('Please select a TDS rule');
      }

      const transactionData: CreateTDSTransactionData = {
        ...data,
        tds_rate: selectedRule.rate_percentage,
        transaction_amount: Number(data.transaction_amount),
      };

      await createTDSTransaction.mutateAsync(transactionData);
      setIsDialogOpen(false);
      reset();
      setSelectedTDSRule(null);
      setTransactionAmount(0);
    } catch (error) {
      console.error('Error creating TDS transaction:', error);
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    reset();
    setSelectedTDSRule(null);
    setTransactionAmount(0);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record TDS Transaction
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            Record TDS Transaction
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleCreateTransaction)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client/Vendor</Label>
              <Select onValueChange={(value) => setValue('client_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client/vendor" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.client_id && (
                <p className="text-sm text-red-500">Client/Vendor is required</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor_name">Vendor Name</Label>
              <Input
                id="vendor_name"
                placeholder="Enter vendor name"
                {...register('vendor_name', { required: 'Vendor name is required' })}
              />
              {errors.vendor_name && (
                <p className="text-sm text-red-500">{errors.vendor_name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_amount">Transaction Amount</Label>
              <Input
                id="transaction_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter amount"
                {...register('transaction_amount', { 
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Amount must be greater than 0' }
                })}
              />
              {errors.transaction_amount && (
                <p className="text-sm text-red-500">{errors.transaction_amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction_date">Transaction Date</Label>
              <Input
                id="transaction_date"
                type="date"
                defaultValue={format(new Date(), 'yyyy-MM-dd')}
                {...register('transaction_date', { required: 'Date is required' })}
              />
              {errors.transaction_date && (
                <p className="text-sm text-red-500">{errors.transaction_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tds_rule_id">TDS Category</Label>
            <Select onValueChange={(value) => setValue('tds_rule_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select TDS category" />
              </SelectTrigger>
              <SelectContent>
                {tdsRules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.category} ({rule.rate_percentage}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tds_rule_id && (
              <p className="text-sm text-red-500">TDS category is required</p>
            )}
          </div>

          {/* TDS Calculation Preview */}
          {transactionAmount > 0 && selectedTDSRule && (
            <TDSCalculator 
              amount={transactionAmount} 
              rate={selectedTDSRule.rate_percentage} 
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor_pan">Vendor PAN (Optional)</Label>
              <Input
                id="vendor_pan"
                placeholder="e.g., ABCDE1234F"
                maxLength={10}
                {...register('vendor_pan')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="certificate_number">Certificate Number (Optional)</Label>
              <Input
                id="certificate_number"
                placeholder="TDS certificate number"
                {...register('certificate_number')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Transaction description or notes"
              {...register('description')}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit" 
              className="flex-1"
              disabled={createTDSTransaction.isPending}
            >
              {createTDSTransaction.isPending ? 'Recording...' : 'Record Transaction'}
            </Button>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TDSTransactionForm;