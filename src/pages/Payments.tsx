import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ExternalLink, History, Link as LinkIcon, Loader2, RefreshCw } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useToast } from '@/hooks/use-toast';
import { useVendors } from '@/hooks/useVendors';
import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postPaymentLinkJournal } from '@/utils/autoJournalEntry';

type LinkStatus = 'created' | 'partially_paid' | 'paid' | 'expired' | 'cancelled' | 'unknown';

type StatusHistoryEntry = {
  status: LinkStatus;
  timestamp: string;
};

type GeneratedLink = {
  id: string;
  vendorName: string;
  amount: number;
  description: string;
  url: string;
  createdAt: string;
  status?: LinkStatus;
  amountPaid?: number;
};

const formatINR = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);

const statusLabel = (status: LinkStatus): string => {
  switch (status) {
    case 'paid': return 'Paid';
    case 'partially_paid': return 'Partially Paid';
    case 'expired': return 'Expired';
    case 'cancelled': return 'Cancelled';
    case 'created': return 'Created';
    default: return 'Pending';
  }
};

const statusColor = (status: LinkStatus): string => {
  switch (status) {
    case 'paid': return 'bg-green-500';
    case 'partially_paid': return 'bg-amber-500';
    case 'expired': return 'bg-gray-400';
    case 'cancelled': return 'bg-red-500';
    case 'created': return 'bg-blue-500';
    default: return 'bg-gray-400';
  }
};

const timeAgo = (dateStr: string): string => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const Payments: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
  const [statusHistory, setStatusHistory] = useState<Record<string, StatusHistoryEntry[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const journalPostedRef = useRef<Set<string>>(new Set());

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === vendorId),
    [vendors, vendorId]
  );

  const handleCreateLink = async () => {
    if (!user?.id) {
      toast({ title: 'Sign in required', description: 'Please sign in before creating a payment link.', variant: 'destructive' });
      return;
    }

    const parsedAmount = Number(amount);
    if (!selectedVendor || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Validation', description: 'Select a vendor and enter a valid amount.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: {
          userId: normalizeUserId(user.id),
          amount: parsedAmount,
          description: description || `Payment request for ${selectedVendor.name}`,
          vendor: {
            id: selectedVendor.id,
            name: selectedVendor.name,
            email: selectedVendor.email,
            phone: selectedVendor.phone,
          },
        },
      });

      if (error) throw new Error(error.message || 'Payment link creation failed');
      if (data?.error) throw new Error(data.error);

      const url = data?.paymentLink;
      if (!url) throw new Error('Payment link was not returned.');

      const linkId = data.paymentLinkId || crypto.randomUUID();
      const createdTime = new Date().toISOString();
      setGeneratedLinks((current) => [
        {
          id: linkId,
          vendorName: selectedVendor.name,
          amount: parsedAmount,
          description: description || `Payment request for ${selectedVendor.name}`,
          url,
          createdAt: createdTime,
          status: 'created',
          amountPaid: 0,
        },
        ...current,
      ]);
      setStatusHistory((prev) => ({
        ...prev,
        [linkId]: [{ status: 'created', timestamp: createdTime }],
      }));
      setAmount('');
      setDescription('');
      toast({ title: 'Payment link created', description: 'The link is ready to copy or open.' });
    } catch (error: any) {
      toast({
        title: 'Could not create link',
        description: error.message || 'Check Razorpay setup in Settings > Payments and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Copied', description: 'Payment link copied to clipboard.' });
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStatuses = async () => {
    if (!user?.id || generatedLinks.length === 0) return;
    setIsRefreshing(true);
    try {
      const ids = generatedLinks
        .map((l) => l.id)
        .filter((id) => id && !id.includes('-')); // Razorpay IDs don't contain dashes; skip uuid fallbacks
      if (ids.length === 0) return;
      const { data, error } = await supabase.functions.invoke('check-payment-link-status', {
        body: { userId: normalizeUserId(user.id), paymentLinkIds: ids },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const results = data?.results || {};
      const now = new Date().toISOString();
      setGeneratedLinks((current) =>
        current.map((l) => {
          const r = results[l.id];
          if (!r) return l;
          const newStatus = r.status as LinkStatus;
          // Record status transition if status changed
          if (newStatus !== l.status) {
            setStatusHistory((prev) => {
              const existing = prev[l.id] || [{ status: l.status || 'created', timestamp: l.createdAt }];
              return {
                ...prev,
                [l.id]: [...existing, { status: newStatus, timestamp: now }],
              };
            });

            // Auto-post journal when payment link is fully paid
            if (newStatus === 'paid' && !journalPostedRef.current.has(l.id)) {
              journalPostedRef.current.add(l.id);
              postPaymentLinkJournal(user!.id, {
                payment_link_id: l.id,
                date: now.split('T')[0],
                vendor_name: l.vendorName,
                amount: r.amount_paid ?? l.amount,
                description: l.description,
              }).catch((err) => console.error('Journal posting failed for payment link:', l.id, err));
            }
          }
          return { ...l, status: newStatus, amountPaid: r.amount_paid ?? l.amountPaid };
        })
      );
    } catch (e: any) {
      toast({ title: 'Could not refresh status', description: e.message, variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh statuses on mount and every 30s while there are unpaid links
  useEffect(() => {
    const hasPending = generatedLinks.some((l) => l.status !== 'paid' && l.status !== 'cancelled' && l.status !== 'expired');
    if (!hasPending || generatedLinks.length === 0) return;
    refreshStatuses();
    const t = setInterval(refreshStatuses, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedLinks.length]);

  const statusBadge = (status?: LinkStatus) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>;
      case 'partially_paid':
        return <Badge className="bg-amber-500 hover:bg-amber-500">Partially Paid</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'created':
        return <Badge variant="outline">Not Paid</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Payment Links</h1>
          <p className="text-muted-foreground">Create Razorpay payment links by vendor and amount</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LinkIcon className="h-4 w-4" />
              Create Link
            </CardTitle>
            <CardDescription>Select a vendor, enter an amount, and generate a shareable link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId} disabled={vendorsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={vendorsLoading ? 'Loading vendors...' : 'Select vendor'} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}{vendor.email ? ` - ${vendor.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Payment purpose"
                rows={3}
              />
            </div>

            <Button className="w-full" onClick={handleCreateLink} disabled={isCreating || !vendorId || !amount}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
              {isCreating ? 'Creating...' : 'Generate Payment Link'}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Generated Links</CardTitle>
                <CardDescription>Status updates automatically every 30 seconds.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshStatuses}
                disabled={isRefreshing || generatedLinks.length === 0}
              >
                {isRefreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {generatedLinks.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No payment links generated yet.
              </div>
            ) : (
              <div className="space-y-3">
                {generatedLinks.map((link) => {
                  const history = statusHistory[link.id] || [{ status: link.status || 'created', timestamp: link.createdAt }];
                  const lastEntry = history[history.length - 1];
                  const isExpanded = expandedHistory[link.id] ?? false;
                  return (
                    <div key={link.id} className="rounded-md border p-4 transition-shadow hover:shadow-md">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{link.vendorName}</span>
                            {statusBadge(link.status)}
                          </div>
                          <div className="text-sm text-muted-foreground">{link.description}</div>
                          <div className="mt-1 text-sm font-semibold">
                            {formatINR(link.amount)}
                            {link.status === 'partially_paid' && link.amountPaid != null && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (Paid: {formatINR(link.amountPaid)})
                              </span>
                            )}
                          </div>
                          <div className="mt-2 truncate text-xs text-muted-foreground">{link.url}</div>
                          {/* Last Updated */}
                          <div className="mt-1 text-xs text-muted-foreground">
                            Last updated: {timeAgo(lastEntry.timestamp)}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button variant="outline" size="sm" onClick={() => copyLink(link.url)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={link.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open
                            </a>
                          </Button>
                        </div>
                      </div>

                      {/* Payment History Toggle */}
                      <div className="mt-3 border-t pt-3">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setExpandedHistory((prev) => ({ ...prev, [link.id]: !isExpanded }))}
                        >
                          <History className="h-3.5 w-3.5" />
                          Payment History ({history.length})
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 ml-1 relative">
                            {/* Vertical timeline line */}
                            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
                            <div className="space-y-3">
                              {history.map((entry, idx) => (
                                <div key={idx} className="flex items-start gap-3 relative">
                                  {/* Dot */}
                                  <div className={`mt-1 h-[11px] w-[11px] rounded-full border-2 border-background shrink-0 z-10 ${statusColor(entry.status)}`} />
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-foreground">{statusLabel(entry.status)}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {new Date(entry.timestamp).toLocaleString('en-IN', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      })}
                                      <span className="ml-1.5 opacity-60">({timeAgo(entry.timestamp)})</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Payments;
