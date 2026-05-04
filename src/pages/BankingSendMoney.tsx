import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Send, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const BENEFICIARY_STORAGE_KEY = 'aczen-banking-beneficiaries';
const TRANSFER_STORAGE_KEY = 'aczen-banking-transfers';

type Beneficiary = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountType: 'savings' | 'current';
  nickname?: string;
};

type TransferRecord = {
  id: string;
  beneficiaryName: string;
  amount: number;
  mode: 'neft' | 'imps' | 'rtgs';
  date: string;
  note?: string;
};

const BankingSendMoney = () => {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<TransferRecord['mode']>('imps');
  const [note, setNote] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const savedBeneficiaries = window.localStorage.getItem(BENEFICIARY_STORAGE_KEY);
    const savedTransfers = window.localStorage.getItem(TRANSFER_STORAGE_KEY);

    try {
      if (savedBeneficiaries) setBeneficiaries(JSON.parse(savedBeneficiaries));
      if (savedTransfers) setTransfers(JSON.parse(savedTransfers));
    } catch {
      window.localStorage.removeItem(TRANSFER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TRANSFER_STORAGE_KEY, JSON.stringify(transfers));
  }, [transfers]);

  const selectedBeneficiary = useMemo(
    () => beneficiaries.find((beneficiary) => beneficiary.id === beneficiaryId),
    [beneficiaries, beneficiaryId]
  );

  const maskAccount = (accountNumber: string) =>
    accountNumber.length > 4 ? `**** ${accountNumber.slice(-4)}` : accountNumber;

  const handleSendMoney = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const transferAmount = Number(amount);

    if (!selectedBeneficiary || !transferAmount || transferAmount <= 0) {
      toast({
        title: 'Transfer details needed',
        description: 'Select a beneficiary and enter a valid amount.',
        variant: 'destructive',
      });
      return;
    }

    const transfer: TransferRecord = {
      id: crypto.randomUUID(),
      beneficiaryName: selectedBeneficiary.name,
      amount: transferAmount,
      mode,
      date: new Date().toISOString(),
      note: note.trim() || undefined,
    };

    setTransfers((current) => [transfer, ...current].slice(0, 10));
    setAmount('');
    setNote('');
    toast({
      title: 'Money transfer queued',
      description: `INR ${transferAmount.toLocaleString('en-IN')} to ${selectedBeneficiary.name} via ${mode.toUpperCase()}.`,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Send className="h-4 w-4" />
            Banking
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Send Money</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Send money to saved beneficiary accounts through IMPS, NEFT, or RTGS.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/banking/beneficiaries">
            <UserRound className="h-4 w-4" />
            Manage Beneficiaries
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Transfer Details</CardTitle>
            <CardDescription>Select a beneficiary and enter the amount to send.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendMoney} className="space-y-4">
              <div className="space-y-2">
                <Label>Beneficiary</Label>
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select beneficiary account" />
                  </SelectTrigger>
                  <SelectContent>
                    {beneficiaries.map((beneficiary) => (
                      <SelectItem key={beneficiary.id} value={beneficiary.id}>
                        {beneficiary.name} - {maskAccount(beneficiary.accountNumber)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="transfer-amount">Amount</Label>
                  <Input
                    id="transfer-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="25000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Transfer Mode</Label>
                  <Select value={mode} onValueChange={(value: TransferRecord['mode']) => setMode(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imps">IMPS</SelectItem>
                      <SelectItem value="neft">NEFT</SelectItem>
                      <SelectItem value="rtgs">RTGS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-note">Notes</Label>
                <Textarea
                  id="transfer-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Invoice settlement, advance, salary, or vendor payout"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={beneficiaries.length === 0}>
                <Send className="h-4 w-4" />
                Send Money
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {beneficiaries.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Beneficiary Added</CardTitle>
                <CardDescription>Add a beneficiary account before sending money.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="gap-2">
                  <Link to="/banking/beneficiaries">
                    Add Beneficiary
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : selectedBeneficiary ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Transfer Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium">{selectedBeneficiary.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-medium">{selectedBeneficiary.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{maskAccount(selectedBeneficiary.accountNumber)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IFSC</span>
                  <span className="font-medium">{selectedBeneficiary.ifsc}</span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Recent Transfers</CardTitle>
              <CardDescription>Latest money transfers queued from Banking.</CardDescription>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No transfers queued yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {transfers.map((transfer) => (
                    <div key={transfer.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{transfer.beneficiaryName}</p>
                        <p className="text-xs text-muted-foreground">
                          {transfer.mode.toUpperCase()} - {new Date(transfer.date).toLocaleString('en-IN')}
                        </p>
                        {transfer.note && <p className="mt-1 text-xs text-muted-foreground">{transfer.note}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">INR {transfer.amount.toLocaleString('en-IN')}</p>
                        <p className="flex items-center justify-end gap-1 text-xs text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Queued
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BankingSendMoney;
