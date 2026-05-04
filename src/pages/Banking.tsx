import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Link as LinkIcon,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import KYCVerification from '@/components/KYCVerification';

const BANKING_URL = 'https://onemoney-link.vercel.app/';
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

type TransferRecord = {
  id: string;
  beneficiaryName: string;
  amount: number;
  mode: 'neft' | 'imps' | 'rtgs';
  date: string;
  note?: string;
};

const initialBeneficiaryForm = {
  name: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  accountType: 'current' as Beneficiary['accountType'],
  nickname: '',
};

const Banking = () => {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneficiaryForm, setBeneficiaryForm] = useState(initialBeneficiaryForm);
  const [transferBeneficiaryId, setTransferBeneficiaryId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferMode, setTransferMode] = useState<TransferRecord['mode']>('imps');
  const [transferNote, setTransferNote] = useState('');
  const [recentTransfers, setRecentTransfers] = useState<TransferRecord[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const savedBeneficiaries = window.localStorage.getItem(BENEFICIARY_STORAGE_KEY);
    if (!savedBeneficiaries) return;

    try {
      setBeneficiaries(JSON.parse(savedBeneficiaries));
    } catch {
      window.localStorage.removeItem(BENEFICIARY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(BENEFICIARY_STORAGE_KEY, JSON.stringify(beneficiaries));
  }, [beneficiaries]);

  const selectedBeneficiary = useMemo(
    () => beneficiaries.find((beneficiary) => beneficiary.id === transferBeneficiaryId),
    [beneficiaries, transferBeneficiaryId]
  );

  const totalBeneficiaries = beneficiaries.length;
  const totalSent = recentTransfers.reduce((sum, transfer) => sum + transfer.amount, 0);

  const maskAccount = (accountNumber: string) =>
    accountNumber.length > 4 ? `•••• ${accountNumber.slice(-4)}` : accountNumber;

  const handleAddBeneficiary = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !beneficiaryForm.name.trim() ||
      !beneficiaryForm.bankName.trim() ||
      !beneficiaryForm.accountNumber.trim() ||
      !beneficiaryForm.ifsc.trim()
    ) {
      toast({
        title: 'Missing beneficiary details',
        description: 'Add the account holder, bank, account number, and IFSC.',
        variant: 'destructive',
      });
      return;
    }

    const newBeneficiary: Beneficiary = {
      id: crypto.randomUUID(),
      name: beneficiaryForm.name.trim(),
      bankName: beneficiaryForm.bankName.trim(),
      accountNumber: beneficiaryForm.accountNumber.trim(),
      ifsc: beneficiaryForm.ifsc.trim().toUpperCase(),
      accountType: beneficiaryForm.accountType,
      nickname: beneficiaryForm.nickname.trim() || undefined,
    };

    setBeneficiaries((current) => [newBeneficiary, ...current]);
    setBeneficiaryForm(initialBeneficiaryForm);
    toast({
      title: 'Beneficiary added',
      description: `${newBeneficiary.name} is ready for transfers.`,
    });
  };

  const handleDeleteBeneficiary = (id: string) => {
    setBeneficiaries((current) => current.filter((beneficiary) => beneficiary.id !== id));
    if (transferBeneficiaryId === id) setTransferBeneficiaryId('');
  };

  const handleSendMoney = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(transferAmount);

    if (!selectedBeneficiary || !amount || amount <= 0) {
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
      amount,
      mode: transferMode,
      date: new Date().toISOString(),
      note: transferNote.trim() || undefined,
    };

    setRecentTransfers((current) => [transfer, ...current].slice(0, 6));
    setTransferAmount('');
    setTransferNote('');
    toast({
      title: 'Money transfer queued',
      description: `INR ${amount.toLocaleString('en-IN')} to ${selectedBeneficiary.name} via ${transferMode.toUpperCase()}.`,
    });
  };

  return (
    <div className="min-h-[100svh] bg-background">
      <div className="fixed left-4 top-4 z-20 md:hidden">
        <div className="rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Banknote className="h-4 w-4" />
              Banking
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
              Banking workspace
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage beneficiaries, send money, access payment links, and open the connected banking webview.
            </p>
          </div>

          <div className="w-full lg:max-w-md">
            <KYCVerification compact className="bg-background shadow-sm" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Beneficiaries</CardDescription>
              <CardTitle className="text-2xl">{totalBeneficiaries}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Queued transfers</CardDescription>
              <CardTitle className="text-2xl">{recentTransfers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total sent this session</CardDescription>
              <CardTitle className="text-2xl">INR {totalSent.toLocaleString('en-IN')}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="beneficiaries" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 md:w-auto md:grid-cols-4">
            <TabsTrigger value="beneficiaries" className="gap-2">
              <UserRound className="h-4 w-4" />
              Beneficiaries
            </TabsTrigger>
            <TabsTrigger value="send" className="gap-2">
              <Send className="h-4 w-4" />
              Send Money
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Payment Links
            </TabsTrigger>
            <TabsTrigger value="webview" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Webview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="beneficiaries" className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Add Beneficiary Account</CardTitle>
                <CardDescription>Save account details for NEFT, IMPS, or RTGS transfers.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddBeneficiary} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="beneficiary-name">Account Holder Name</Label>
                    <Input
                      id="beneficiary-name"
                      value={beneficiaryForm.name}
                      onChange={(event) => setBeneficiaryForm((form) => ({ ...form, name: event.target.value }))}
                      placeholder="Aarav Enterprises"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bank-name">Bank Name</Label>
                      <Input
                        id="bank-name"
                        value={beneficiaryForm.bankName}
                        onChange={(event) => setBeneficiaryForm((form) => ({ ...form, bankName: event.target.value }))}
                        placeholder="HDFC Bank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Type</Label>
                      <Select
                        value={beneficiaryForm.accountType}
                        onValueChange={(value: Beneficiary['accountType']) =>
                          setBeneficiaryForm((form) => ({ ...form, accountType: value }))
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
                        value={beneficiaryForm.accountNumber}
                        onChange={(event) => setBeneficiaryForm((form) => ({ ...form, accountNumber: event.target.value }))}
                        placeholder="123456789012"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ifsc">IFSC</Label>
                      <Input
                        id="ifsc"
                        value={beneficiaryForm.ifsc}
                        onChange={(event) => setBeneficiaryForm((form) => ({ ...form, ifsc: event.target.value }))}
                        placeholder="HDFC0001234"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nickname">Nickname</Label>
                    <Input
                      id="nickname"
                      value={beneficiaryForm.nickname}
                      onChange={(event) => setBeneficiaryForm((form) => ({ ...form, nickname: event.target.value }))}
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
                <CardDescription>Accounts added here are available in Send Money.</CardDescription>
              </CardHeader>
              <CardContent>
                {beneficiaries.length === 0 ? (
                  <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                    <UserRound className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">No beneficiary accounts yet</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      Add an account holder and bank details to start making transfers.
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
                            onClick={() => handleDeleteBeneficiary(beneficiary.id)}
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
                          {beneficiary.nickname && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Nickname</span>
                              <span className="font-medium">{beneficiary.nickname}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="send" className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Send Money</CardTitle>
                <CardDescription>Choose a saved beneficiary and queue a bank transfer.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSendMoney} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Beneficiary</Label>
                    <Select value={transferBeneficiaryId} onValueChange={setTransferBeneficiaryId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
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
                        value={transferAmount}
                        onChange={(event) => setTransferAmount(event.target.value)}
                        placeholder="25000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Transfer Mode</Label>
                      <Select value={transferMode} onValueChange={(value: TransferRecord['mode']) => setTransferMode(value)}>
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
                      value={transferNote}
                      onChange={(event) => setTransferNote(event.target.value)}
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
              {selectedBeneficiary && (
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
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Recent Transfers</CardTitle>
                  <CardDescription>Transfers queued from this banking workspace.</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentTransfers.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No transfers queued yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentTransfers.map((transfer) => (
                        <div key={transfer.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div>
                            <p className="font-medium">{transfer.beneficiaryName}</p>
                            <p className="text-xs text-muted-foreground">
                              {transfer.mode.toUpperCase()} · {new Date(transfer.date).toLocaleString('en-IN')}
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
          </TabsContent>

          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle>Payment Links</CardTitle>
                <CardDescription>Create and manage customer payment links from the Banking section.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border bg-primary/10 p-3 text-primary">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Collect payments through links</p>
                    <p className="text-sm text-muted-foreground">
                      Open the existing payment links workspace without leaving Banking.
                    </p>
                  </div>
                </div>
                <Button asChild className="gap-2">
                  <Link to="/payments">
                    Open Payment Links
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webview">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Connected Banking Webview</CardTitle>
                  <CardDescription>Use the embedded OneMoney banking experience.</CardDescription>
                </div>
                <Button asChild variant="outline" className="gap-2">
                  <a href={BANKING_URL} target="_blank" rel="noreferrer">
                    Open in New Tab
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative h-[70svh] min-h-[520px]">
                  {!iframeLoaded && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-sm text-muted-foreground">
                      Loading banking webview...
                    </div>
                  )}
                  <iframe
                    src={BANKING_URL}
                    title="OneMoney Banking Webview"
                    className={`h-full w-full border-0 ${iframeLoaded ? 'visible' : 'invisible'}`}
                    onLoad={() => setIframeLoaded(true)}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="fullscreen"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Banking;
