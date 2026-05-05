import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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

// ── Decentro config (staging) ─────────────────────────────────────────────────
const D = {
  clientId:       import.meta.env.VITE_DECENTRO_CLIENT_ID       ?? '',
  clientSecret:   import.meta.env.VITE_DECENTRO_CLIENT_SECRET   ?? '',
  moduleSecret:   import.meta.env.VITE_DECENTRO_MODULE_SECRET   ?? '',
  providerSecret: import.meta.env.VITE_DECENTRO_PROVIDER_SECRET ?? '',
  baseUrl:        import.meta.env.VITE_DECENTRO_BASE_URL        ?? '/decentro',
  vaNumber:       import.meta.env.VITE_DECENTRO_VA_NUMBER       ?? '',
};

// strip non-alphanumeric (keep spaces), max 35 chars
const sanitizePurpose = (s: string) =>
  s.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 35) || 'Fund Transfer';

const BANKING_URL         = 'https://onemoney-link.vercel.app/';
const ACCOUNTS_KEY        = 'aczen-linked-accounts';
const TRANSFERS_KEY       = 'aczen-transfers';
const CONSUMER_URN_KEY    = 'aczen-decentro-consumer-urn';

// Decentro consumer_urn must be a urn that's already registered with Decentro.
// Read from .env first (VITE_DECENTRO_CONSUMER_URN), then localStorage (user-pasted).
const getConsumerUrn = (): string => {
  const fromEnv = import.meta.env.VITE_DECENTRO_CONSUMER_URN as string | undefined;
  if (fromEnv) return fromEnv;
  return localStorage.getItem(CONSUMER_URN_KEY) ?? '';
};

// ── Types ─────────────────────────────────────────────────────────────────────
type LinkedAccount = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountType: 'savings' | 'current';
  verified: boolean;
  decentroTxnId?: string;
};

type Transfer = {
  id: string;
  referenceId: string;
  fromAccount: LinkedAccount;
  toName: string;
  toAccount: string;
  toIfsc: string;
  amount: number;
  mode: 'IMPS' | 'NEFT' | 'RTGS';
  note: string;
  date: string;
  status: 'pending' | 'success' | 'failed';
  decentroTxnId?: string;
};

const initialAccountForm = {
  name: '', bankName: '', accountNumber: '', ifsc: '',
  accountType: 'savings' as LinkedAccount['accountType'],
};

const initialTransferForm = {
  fromAccountId: '', toName: '', toAccount: '', toIfsc: '',
  amount: '', mode: 'IMPS' as Transfer['mode'], note: '',
};

// ── Decentro API helper ───────────────────────────────────────────────────────
const extractDecentroError = (data: unknown): string => {
  if (!data || typeof data !== 'object') return JSON.stringify(data);
  const d = data as Record<string, unknown>;
  const direct =
    (d.message as string) ??
    (d.responseMessage as string) ??
    (d.response_message as string) ??
    (d.error as string);
  if (direct) return direct;
  // Decentro often nests field-level errors under data.errors / data.error
  const nested = d.data ?? d.errors ?? d.error;
  return JSON.stringify(nested ?? d);
};

const decentroPost = async (path: string, body: Record<string, unknown>) => {
  console.log('[Decentro POST]', path, body);
  const res = await fetch(`${D.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'client_id':      D.clientId,
      'client_secret':  D.clientSecret,
      'module_secret':  D.moduleSecret,
      'provider_secret':D.providerSecret,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  console.log('[Decentro RES]', path, res.status, data);
  if (!res.ok) {
    throw new Error(`[${res.status}] ${extractDecentroError(data)}`);
  }
  return data;
};

const decentroGet = async (path: string, params: Record<string, string>) => {
  const url = new URL(`${window.location.origin}${D.baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'client_id':      D.clientId,
      'client_secret':  D.clientSecret,
      'module_secret':  D.moduleSecret,
      'provider_secret':D.providerSecret,
    },
  });
  const data = await res.json().catch(() => ({}));
  console.log('[Decentro RES]', path, res.status, data);
  if (!res.ok) {
    throw new Error(`[${res.status}] ${extractDecentroError(data)}`);
  }
  return data;
};

const refId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();

// ── Component ─────────────────────────────────────────────────────────────────
const Banking = () => {
  const [iframeLoaded,    setIframeLoaded]    = useState(false);
  const [accounts,        setAccounts]        = useState<LinkedAccount[]>([]);
  const [accountForm,     setAccountForm]     = useState(initialAccountForm);
  const [isLinking,       setIsLinking]       = useState(false);
  const [transfers,       setTransfers]       = useState<Transfer[]>([]);
  const [transferForm,    setTransferForm]    = useState(initialTransferForm);
  const [isSending,       setIsSending]       = useState(false);
  const [lastError,       setLastError]       = useState<string>('');
  const [consumerUrn,     setConsumerUrn]     = useState<string>(getConsumerUrn());
  const [consumerUrnInput, setConsumerUrnInput] = useState<string>(getConsumerUrn());
  const { toast } = useToast();

  const saveConsumerUrn = () => {
    const v = consumerUrnInput.trim();
    if (!v) {
      localStorage.removeItem(CONSUMER_URN_KEY);
      setConsumerUrn('');
      toast({ title: 'Consumer URN cleared' });
      return;
    }
    localStorage.setItem(CONSUMER_URN_KEY, v);
    setConsumerUrn(v);
    toast({ title: 'Consumer URN saved', description: v });
  };

  // load from localStorage
  useEffect(() => {
    try {
      const a = localStorage.getItem(ACCOUNTS_KEY);
      if (a) setAccounts(JSON.parse(a));
      const t = localStorage.getItem(TRANSFERS_KEY);
      if (t) setTransfers(JSON.parse(t));
    } catch { /* ignore */ }
  }, []);

  const saveAccounts  = (list: LinkedAccount[]) => { setAccounts(list);  localStorage.setItem(ACCOUNTS_KEY,  JSON.stringify(list)); };
  const saveTransfers = (list: Transfer[])       => { setTransfers(list); localStorage.setItem(TRANSFERS_KEY, JSON.stringify(list)); };

  const maskAcc = (n: string) => n.length > 4 ? `•••• ${n.slice(-4)}` : n;

  const totalSent = transfers
    .filter(t => t.status === 'success')
    .reduce((s, t) => s + t.amount, 0);

  // ── Link a bank account (penny drop validation) ───────────────────────────
  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, bankName, accountNumber, ifsc, accountType } = accountForm;
    if (!name.trim() || !accountNumber.trim() || !ifsc.trim()) {
      toast({ title: 'Missing details', description: 'Fill in name, account number, and IFSC.', variant: 'destructive' });
      return;
    }

    setIsLinking(true);
    setLastError('');
    let verified = false;
    let decentroTxnId: string | undefined;

    try {
      if (!D.vaNumber) {
        throw new Error('VITE_DECENTRO_VA_NUMBER is not set in .env — penny drop needs a VA to debit ₹1 from.');
      }
      const urn = getConsumerUrn();
      if (!urn) {
        throw new Error('No Decentro consumer_urn set. Paste a registered consumer URN from your Decentro dashboard into the "Decentro Consumer" box above.');
      }
      const res = await decentroPost('/v3/banking/money_transfer/validate_bank_account', {
        reference_id:     refId(),
        consumer_urn:     urn,
        purpose_message:  'Account Verification',
        from_account:     D.vaNumber,
        transfer_amount:  1,
        validation_type:  'pennydrop',
        beneficiary_details: {
          name:           name.trim(),
          account_number: accountNumber.trim(),
          ifsc:           ifsc.trim().toUpperCase(),
        },
      });

      decentroTxnId = res.decentroTxnId ?? res.decentro_txn_id;
      const status  = res.data?.account_status ?? res.accountStatus;
      verified      = status === 'Valid';

      if (verified) {
        toast({ title: 'Account verified', description: `${name.trim()} — ${bankName.trim()} confirmed via penny drop.` });
      } else {
        toast({ title: 'Verification failed', description: `Account status: ${status}. Saved but marked unverified.`, variant: 'destructive' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not verify account. Saved locally.';
      setLastError(`Link account: ${msg}`);
      toast({
        title: 'Penny drop failed',
        description: msg,
        variant: 'destructive',
      });
    }

    const newAccount: LinkedAccount = {
      id: crypto.randomUUID(),
      name:          name.trim(),
      bankName:      bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifsc:          ifsc.trim().toUpperCase(),
      accountType,
      verified,
      decentroTxnId,
    };
    saveAccounts([newAccount, ...accounts]);
    setAccountForm(initialAccountForm);
    setIsLinking(false);
  };

  // ── Send money ────────────────────────────────────────────────────────────
  const handleSendMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    const { fromAccountId, toName, toAccount, toIfsc, amount, mode, note } = transferForm;
    const fromAccount = accounts.find(a => a.id === fromAccountId);
    const amt = Number(amount);

    if (!fromAccount || !toName.trim() || !toAccount.trim() || !toIfsc.trim() || !amt || amt <= 0) {
      toast({ title: 'Missing details', description: 'Fill in all fields.', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    const referenceId = refId();
    let status:        Transfer['status']  = 'pending';
    let decentroTxnId: string | undefined;

    try {
      const urn = getConsumerUrn();
      if (!urn) {
        throw new Error('No Decentro consumer_urn set. Paste one in the "Decentro Consumer" box above.');
      }
      const res = await decentroPost('/core_banking/money_transfer/initiate', {
        reference_id:    referenceId,
        consumer_urn:    urn,
        purpose_message: sanitizePurpose(note || `Transfer to ${toName.trim()}`),
        from_account:    D.vaNumber,
        to_account:      toAccount.trim(),
        transfer_type:   mode,
        transfer_amount: parseFloat(amt.toFixed(2)),
        beneficiary_details: {
          payee_name: toName.trim().replace(/[^a-zA-Z ]/g, ''),
          ifsc_code:  toIfsc.trim().toUpperCase(),
        },
      });

      decentroTxnId = res.decentroTxnId ?? res.decentro_txn_id;
      const txStatus = (res.transactionStatus ?? res.transaction_status ?? '').toLowerCase();
      status = txStatus === 'success' ? 'success' : txStatus === 'failure' ? 'failed' : 'pending';

      toast({ title: 'Transfer initiated', description: `Ref: ${referenceId} — ${res.message ?? status}` });

      // poll status after 3 s if still pending
      if (status === 'pending') {
        setTimeout(async () => {
          try {
            const poll = await decentroGet('/core_banking/money_transfer/get_status', { reference_id: referenceId });
            const polledStatus = (poll.transactionStatus ?? '').toLowerCase();
            const finalStatus: Transfer['status'] = polledStatus === 'success' ? 'success' : polledStatus === 'failure' ? 'failed' : 'pending';
            setTransfers(prev => {
              const updated = prev.map(t => t.referenceId === referenceId ? { ...t, status: finalStatus } : t);
              localStorage.setItem(TRANSFERS_KEY, JSON.stringify(updated));
              return updated;
            });
          } catch { /* silent */ }
        }, 3000);
      }
    } catch (err) {
      status = 'failed';
      const msg = err instanceof Error ? err.message : 'Could not initiate transfer.';
      setLastError(`Send money: ${msg}`);
      toast({
        title: 'Transfer failed',
        description: msg,
        variant: 'destructive',
      });
    }

    const transfer: Transfer = {
      id: crypto.randomUUID(),
      referenceId,
      fromAccount,
      toName:    toName.trim(),
      toAccount: toAccount.trim(),
      toIfsc:    toIfsc.trim().toUpperCase(),
      amount:    amt,
      mode,
      note:      note.trim(),
      date:      new Date().toISOString(),
      status,
      decentroTxnId,
    };
    saveTransfers([transfer, ...transfers].slice(0, 20));
    setTransferForm(initialTransferForm);
    setIsSending(false);
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100svh] bg-background">
      <div className="fixed left-4 top-4 z-20 md:hidden">
        <div className="rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Banknote className="h-4 w-4" />
              Banking
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Banking workspace</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Link your bank accounts, verify them instantly, and send funds via IMPS / NEFT / RTGS.
            </p>
          </div>
          <div className="w-full lg:max-w-md">
            <KYCVerification compact className="bg-background shadow-sm" />
          </div>
        </div>

        {/* Decentro consumer URN setup */}
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Decentro Consumer URN</CardTitle>
            <CardDescription>
              Decentro requires a pre-registered consumer URN before any account validation or transfer.
              Get yours from the <span className="font-medium">Decentro staging dashboard → Consumers</span>, then paste it here.
              {consumerUrn && <span className="ml-1 text-emerald-600">(currently set: <span className="font-mono">{consumerUrn}</span>)</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={consumerUrnInput}
                onChange={e => setConsumerUrnInput(e.target.value)}
                placeholder="paste consumer_urn here, e.g. 8d4a3b2e-..."
                className="font-mono"
              />
              <Button onClick={saveConsumerUrn}>Save</Button>
            </div>
          </CardContent>
        </Card>

        {lastError && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/30">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="text-rose-700 dark:text-rose-300">
                <p className="font-medium">Decentro error</p>
                <p className="mt-0.5 break-all font-mono text-xs">{lastError}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLastError('')}>Dismiss</Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Linked accounts</CardDescription>
              <CardTitle className="text-2xl">{accounts.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transfers</CardDescription>
              <CardTitle className="text-2xl">{transfers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total sent</CardDescription>
              <CardTitle className="text-2xl">₹{totalSent.toLocaleString('en-IN')}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 md:w-auto md:grid-cols-4">
            <TabsTrigger value="accounts">My Accounts</TabsTrigger>
            <TabsTrigger value="send">Send Money</TabsTrigger>
            <TabsTrigger value="links">Payment Links</TabsTrigger>
            <TabsTrigger value="webview">Webview</TabsTrigger>
          </TabsList>

          {/* ── My Accounts ── */}
          <TabsContent value="accounts" className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Link Bank Account</CardTitle>
                <CardDescription>
                  We'll do a ₹1 penny drop via Decentro to verify the account instantly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLinkAccount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="acc-name">Account Holder Name</Label>
                    <Input
                      id="acc-name"
                      value={accountForm.name}
                      onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ravi Kumar"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bank-name">Bank Name</Label>
                    <Input
                      id="bank-name"
                      value={accountForm.bankName}
                      onChange={e => setAccountForm(f => ({ ...f, bankName: e.target.value }))}
                      placeholder="SBI / HDFC / ICICI"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="acc-number">Account Number</Label>
                      <Input
                        id="acc-number"
                        value={accountForm.accountNumber}
                        onChange={e => setAccountForm(f => ({ ...f, accountNumber: e.target.value }))}
                        placeholder="123456789012"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="acc-ifsc">IFSC</Label>
                      <Input
                        id="acc-ifsc"
                        value={accountForm.ifsc}
                        onChange={e => setAccountForm(f => ({ ...f, ifsc: e.target.value }))}
                        placeholder="SBIN0001234"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select
                      value={accountForm.accountType}
                      onValueChange={v => setAccountForm(f => ({ ...f, accountType: v as LinkedAccount['accountType'] }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="current">Current</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={isLinking}>
                    {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {isLinking ? 'Verifying via Penny Drop...' : 'Link & Verify Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Linked Accounts</CardTitle>
                <CardDescription>Verified accounts are available as source for fund transfers.</CardDescription>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                    <Banknote className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">No accounts linked yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add SBI, HDFC, ICICI or any bank account.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {accounts.map(acc => (
                      <div key={acc.id} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{acc.name}</p>
                            <p className="text-sm text-muted-foreground">{acc.bankName}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {acc.verified
                              ? <Badge variant="secondary" className="gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3 w-3" />Verified</Badge>
                              : <Badge variant="secondary" className="gap-1 text-xs text-rose-500"><XCircle className="h-3 w-3" />Unverified</Badge>
                            }
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => saveAccounts(accounts.filter(a => a.id !== acc.id))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account</span>
                            <span className="font-medium">{maskAcc(acc.accountNumber)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">IFSC</span>
                            <span className="font-medium">{acc.ifsc}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-medium capitalize">{acc.accountType}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Send Money ── */}
          <TabsContent value="send" className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Send Money</CardTitle>
                <CardDescription>Choose a source account and send via Decentro.</CardDescription>
              </CardHeader>
              <CardContent>
                {!D.vaNumber && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      <p className="font-medium">Virtual Account number missing</p>
                      <p>Ask Decentro for your staging VA number, then add it to <span className="font-mono">.env</span> as <span className="font-mono">VITE_DECENTRO_VA_NUMBER=...</span> and restart the dev server.</p>
                    </div>
                  </div>
                )}
                {accounts.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
                    <Banknote className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">No accounts linked</p>
                    <p className="text-sm text-muted-foreground">Link a bank account first to send money.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSendMoney} className="space-y-4">
                    {/* Source account */}
                    <div className="space-y-2">
                      <Label>Send From</Label>
                      <Select
                        value={transferForm.fromAccountId}
                        onValueChange={v => setTransferForm(f => ({ ...f, fromAccountId: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select your account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.bankName} — {maskAcc(acc.accountNumber)}
                              {acc.verified ? ' ✓' : ' (unverified)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Recipient */}
                    <div className="space-y-2">
                      <Label htmlFor="to-name">Recipient Name</Label>
                      <Input
                        id="to-name"
                        value={transferForm.toName}
                        onChange={e => setTransferForm(f => ({ ...f, toName: e.target.value }))}
                        placeholder="Sharma Electronics"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="to-account">Account Number</Label>
                        <Input
                          id="to-account"
                          value={transferForm.toAccount}
                          onChange={e => setTransferForm(f => ({ ...f, toAccount: e.target.value }))}
                          placeholder="987654321098"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="to-ifsc">IFSC</Label>
                        <Input
                          id="to-ifsc"
                          value={transferForm.toIfsc}
                          onChange={e => setTransferForm(f => ({ ...f, toIfsc: e.target.value }))}
                          placeholder="HDFC0001234"
                        />
                      </div>
                    </div>

                    {/* Amount + mode */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount (₹)</Label>
                        <Input
                          id="amount"
                          type="number"
                          min="1"
                          step="0.01"
                          value={transferForm.amount}
                          onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="25000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Mode</Label>
                        <Select
                          value={transferForm.mode}
                          onValueChange={v => setTransferForm(f => ({ ...f, mode: v as Transfer['mode'] }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IMPS">IMPS (instant)</SelectItem>
                            <SelectItem value="NEFT">NEFT</SelectItem>
                            <SelectItem value="RTGS">RTGS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="note">Note</Label>
                      <Textarea
                        id="note"
                        value={transferForm.note}
                        onChange={e => setTransferForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="Invoice #1234, salary, vendor payment..."
                      />
                    </div>

                    <Button type="submit" className="w-full gap-2" disabled={isSending || !D.vaNumber}>
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {isSending ? 'Sending...' : 'Send Money'}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Preview */}
              {transferForm.fromAccountId && transferForm.toName && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Transfer Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    {(() => {
                      const from = accounts.find(a => a.id === transferForm.fromAccountId);
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">From</span>
                            <span className="font-medium">{from?.bankName} — {maskAcc(from?.accountNumber ?? '')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">To</span>
                            <span className="font-medium">{transferForm.toName || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account</span>
                            <span className="font-medium">{maskAcc(transferForm.toAccount) || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">IFSC</span>
                            <span className="font-medium">{transferForm.toIfsc || '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mode</span>
                            <span className="font-medium">{transferForm.mode}</span>
                          </div>
                          {transferForm.amount && (
                            <div className="flex justify-between border-t pt-2">
                              <span className="font-medium">Amount</span>
                              <span className="font-semibold text-emerald-600">₹{Number(transferForm.amount).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* History */}
              <Card>
                <CardHeader>
                  <CardTitle>Transfer History</CardTitle>
                  <CardDescription>All transfers initiated via Decentro.</CardDescription>
                </CardHeader>
                <CardContent>
                  {transfers.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No transfers yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {transfers.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div>
                            <p className="font-medium">{t.toName}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.fromAccount.bankName} → {t.mode} · {new Date(t.date).toLocaleString('en-IN')}
                            </p>
                            {t.referenceId && (
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">Ref: {t.referenceId}</p>
                            )}
                            {t.note && <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{t.amount.toLocaleString('en-IN')}</p>
                            <p className={`flex items-center justify-end gap-1 text-xs ${
                              t.status === 'success' ? 'text-emerald-600'
                              : t.status === 'failed' ? 'text-rose-500'
                              : 'text-amber-500'
                            }`}>
                              {t.status === 'success' ? <CheckCircle2 className="h-3 w-3" />
                               : t.status === 'failed' ? <XCircle className="h-3 w-3" />
                               : <Loader2 className="h-3 w-3 animate-spin" />}
                              {t.status}
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

          {/* ── Payment Links ── */}
          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle>Payment Links</CardTitle>
                <CardDescription>Create and manage customer payment links.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border bg-primary/10 p-3 text-primary">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">Collect payments through links</p>
                    <p className="text-sm text-muted-foreground">Open the payment links workspace.</p>
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

          {/* ── Webview ── */}
          <TabsContent value="webview">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Connected Banking Webview</CardTitle>
                  <CardDescription>Embedded OneMoney banking experience.</CardDescription>
                </div>
                <Button asChild variant="outline" className="gap-2">
                  <a href={BANKING_URL} target="_blank" rel="noreferrer">
                    Open in New Tab <ExternalLink className="h-4 w-4" />
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
