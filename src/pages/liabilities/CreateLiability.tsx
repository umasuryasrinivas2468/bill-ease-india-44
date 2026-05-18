import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { useCreateLiability } from '@/hooks/useLiabilities';
import { calculateEmi, computeEmiSchedule } from '@/services/liabilityService';
import type { CreateLiabilityInput, LiabilityType } from '@/types/liabilities';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const CreateLiability: React.FC = () => {
  const navigate = useNavigate();
  const create = useCreateLiability();
  const [form, setForm] = useState<CreateLiabilityInput>({
    name: '',
    liability_type: 'loan',
    principal_amount: 0,
    interest_rate: 9,
    interest_type: 'reducing',
    tenure_months: 36,
    start_date: new Date().toISOString().slice(0, 10),
    emi_day_of_month: 5,
    disburse_now: true,
    receive_into: 'Bank',
  });

  const isLoan = form.liability_type === 'loan';

  const previewEmi = useMemo(() => {
    if (!isLoan) return 0;
    return calculateEmi(Number(form.principal_amount || 0), Number(form.interest_rate || 0), Number(form.tenure_months || 0));
  }, [isLoan, form.principal_amount, form.interest_rate, form.tenure_months]);

  const previewSchedule = useMemo(() => {
    if (!isLoan || !form.principal_amount || !form.tenure_months || !form.start_date) return [];
    return computeEmiSchedule({
      principal: Number(form.principal_amount),
      annualRate: Number(form.interest_rate || 0),
      tenureMonths: Number(form.tenure_months),
      startDate: form.start_date,
      emiDay: form.emi_day_of_month,
    });
  }, [isLoan, form.principal_amount, form.tenure_months, form.start_date, form.interest_rate, form.emi_day_of_month]);

  const totalPayable = useMemo(
    () => previewSchedule.reduce((s, p) => s + p.total_emi, 0),
    [previewSchedule],
  );
  const totalInterest = useMemo(
    () => previewSchedule.reduce((s, p) => s + p.interest_component, 0),
    [previewSchedule],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.principal_amount <= 0) return;
    create.mutate(form, {
      onSuccess: (res) => navigate(`/liabilities/${res.liability.id}`),
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/liabilities"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">New Liability</h1>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Liability</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HDFC Term Loan, ICICI OD…" required />
              </div>
              <div>
                <Label>Type *</Label>
                <Select value={form.liability_type} onValueChange={(v) => setForm({ ...form, liability_type: v as LiabilityType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan">Term Loan / EMI</SelectItem>
                    <SelectItem value="credit_line">Credit line / OD</SelectItem>
                    <SelectItem value="vendor_advance">Vendor advance received</SelectItem>
                    <SelectItem value="tax">Tax payable</SelectItem>
                    <SelectItem value="long_term">Long-term liability</SelectItem>
                    <SelectItem value="short_term">Short-term liability</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lender / Counterparty</Label>
                <Input value={form.lender_name || ''} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} />
              </div>
              <div>
                <Label>Lender contact</Label>
                <Input value={form.lender_contact || ''} onChange={(e) => setForm({ ...form, lender_contact: e.target.value })} placeholder="Email or phone" />
              </div>
              <div className="md:col-span-2">
                <Label>Account number</Label>
                <Input value={form.account_number || ''} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Money & schedule</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Principal *</Label>
                <Input type="number" min={0} step="0.01" value={form.principal_amount || ''} onChange={(e) => setForm({ ...form, principal_amount: Number(e.target.value) })} required />
              </div>
              <div>
                <Label>Annual interest rate (%)</Label>
                <Input type="number" min={0} max={50} step="0.01" value={form.interest_rate || ''} onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) })} />
              </div>
              {isLoan && (
                <>
                  <div>
                    <Label>Tenure (months)</Label>
                    <Input type="number" min={1} max={600} value={form.tenure_months || ''} onChange={(e) => setForm({ ...form, tenure_months: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>EMI day of month</Label>
                    <Input type="number" min={1} max={31} value={form.emi_day_of_month || ''} onChange={(e) => setForm({ ...form, emi_day_of_month: Number(e.target.value) })} />
                  </div>
                </>
              )}
              <div>
                <Label>Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Interest type</Label>
                <Select value={form.interest_type} onValueChange={(v) => setForm({ ...form, interest_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reducing">Reducing balance</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="none">None / interest-free</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Disbursement</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2 flex items-center gap-2">
                <Switch checked={!!form.disburse_now} onCheckedChange={(v) => setForm({ ...form, disburse_now: v })} />
                <Label className="font-normal">Post disbursement now (Dr Bank / Cr Loan Liability)</Label>
              </div>
              {form.disburse_now && (
                <div>
                  <Label>Receive into</Label>
                  <Select value={form.receive_into} onValueChange={(v) => setForm({ ...form, receive_into: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-orange-500" />Preview</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isLoan ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Monthly EMI</span><span className="font-semibold">{inr(previewEmi)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total payable</span><span>{inr(totalPayable)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total interest</span><span className="text-amber-600">{inr(totalInterest)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Number of EMIs</span><span>{previewSchedule.length}</span></div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-semibold">{inr(form.principal_amount)}</span></div>
                  <div className="text-xs text-muted-foreground">No EMI schedule is generated for this type — manual settlements can be recorded later.</div>
                </>
              )}
              <Separator />
              <div className="text-xs text-muted-foreground">
                On submit: liability is recorded{form.disburse_now ? '; disbursement journal is posted' : ''}{isLoan ? '; full EMI schedule is generated' : ''}.
              </div>
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending ? 'Saving…' : 'Save liability'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
};

export default CreateLiability;
