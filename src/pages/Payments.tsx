import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Link as LinkIcon, Loader2, RefreshCw } from 'lucide-react';
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

type LinkStatus = 'created' | 'partially_paid' | 'paid' | 'expired' | 'cancelled' | 'unknown';

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

const Payments: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);

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

      setGeneratedLinks((current) => [
        {
          id: data.paymentLinkId || crypto.randomUUID(),
          vendorName: selectedVendor.name,
          amount: parsedAmount,
          description: description || `Payment request for ${selectedVendor.name}`,
          url,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
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
            <CardTitle className="text-base">Generated Links</CardTitle>
            <CardDescription>Links created in this session appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            {generatedLinks.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No payment links generated yet.
              </div>
            ) : (
              <div className="space-y-3">
                {generatedLinks.map((link) => (
                  <div key={link.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium">{link.vendorName}</div>
                        <div className="text-sm text-muted-foreground">{link.description}</div>
                        <div className="mt-1 text-sm font-semibold">{formatINR(link.amount)}</div>
                        <div className="mt-2 truncate text-xs text-muted-foreground">{link.url}</div>
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

export default Payments;
