import React, { useEffect, useState } from 'react';
import { Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const BENEFICIARY_STORAGE_KEY = 'aczen-banking-beneficiaries';

type Beneficiary = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountType: 'savings' | 'current';
  nickname?: string;
};

const initialForm = {
  name: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  accountType: 'current' as Beneficiary['accountType'],
  nickname: '',
};

const BankingBeneficiaries = () => {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [form, setForm] = useState(initialForm);
  const { toast } = useToast();

  useEffect(() => {
    const saved = window.localStorage.getItem(BENEFICIARY_STORAGE_KEY);
    if (!saved) return;

    try {
      setBeneficiaries(JSON.parse(saved));
    } catch {
      window.localStorage.removeItem(BENEFICIARY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BENEFICIARY_STORAGE_KEY, JSON.stringify(beneficiaries));
  }, [beneficiaries]);

  const maskAccount = (accountNumber: string) =>
    accountNumber.length > 4 ? `**** ${accountNumber.slice(-4)}` : accountNumber;

  const handleAddBeneficiary = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim() || !form.bankName.trim() || !form.accountNumber.trim() || !form.ifsc.trim()) {
      toast({
        title: 'Missing beneficiary details',
        description: 'Add account holder, bank, account number, and IFSC.',
        variant: 'destructive',
      });
      return;
    }

    const beneficiary: Beneficiary = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      ifsc: form.ifsc.trim().toUpperCase(),
      accountType: form.accountType,
      nickname: form.nickname.trim() || undefined,
    };

    setBeneficiaries((current) => [beneficiary, ...current]);
    setForm(initialForm);
    toast({
      title: 'Beneficiary added',
      description: `${beneficiary.name} is now available for Send Money.`,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <UserRound className="h-4 w-4" />
          Banking
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Beneficiary Accounts</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Add and manage bank accounts that can receive money from your business.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add Beneficiary</CardTitle>
            <CardDescription>Save account details for NEFT, IMPS, or RTGS transfers.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddBeneficiary} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="beneficiary-name">Account Holder Name</Label>
                <Input
                  id="beneficiary-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Aarav Enterprises"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank-name">Bank Name</Label>
                  <Input
                    id="bank-name"
                    value={form.bankName}
                    onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                    placeholder="HDFC Bank"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select
                    value={form.accountType}
                    onValueChange={(value: Beneficiary['accountType']) =>
                      setForm((current) => ({ ...current, accountType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-number">Account Number</Label>
                  <Input
                    id="account-number"
                    value={form.accountNumber}
                    onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
                    placeholder="123456789012"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ifsc">IFSC</Label>
                  <Input
                    id="ifsc"
                    value={form.ifsc}
                    onChange={(event) => setForm((current) => ({ ...current, ifsc: event.target.value }))}
                    placeholder="HDFC0001234"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))}
                  placeholder="Monthly supplier"
                />
              </div>
              <Button type="submit" className="w-full gap-2">
                <Plus className="h-4 w-4" />
                Add Beneficiary
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved Beneficiaries</CardTitle>
            <CardDescription>{beneficiaries.length} account{beneficiaries.length === 1 ? '' : 's'} saved.</CardDescription>
          </CardHeader>
          <CardContent>
            {beneficiaries.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                <UserRound className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No beneficiary accounts yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add a beneficiary to enable Send Money.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {beneficiaries.map((beneficiary) => (
                  <div key={beneficiary.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{beneficiary.name}</p>
                        <p className="text-sm text-muted-foreground">{beneficiary.bankName}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setBeneficiaries((current) => current.filter((item) => item.id !== beneficiary.id))}
                        title="Remove beneficiary"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Account</span>
                        <span className="font-medium">{maskAccount(beneficiary.accountNumber)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">IFSC</span>
                        <span className="font-medium">{beneficiary.ifsc}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium capitalize">{beneficiary.accountType}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BankingBeneficiaries;
