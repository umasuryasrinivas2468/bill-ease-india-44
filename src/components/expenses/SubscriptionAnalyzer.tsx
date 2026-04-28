import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { normalizeUserId } from '@/lib/userUtils';
import { formatINR } from '@/lib/gst';

interface Subscription {
  id: string;
  vendor_name: string;
  product_name: string;
  monthly_cost: number;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  next_renewal_date?: string;
  category?: string;
  seats?: number;
  used_seats?: number;
  is_active: boolean;
  last_used_at?: string;
}

// #19 Subscription Cost Analyzer — track recurring software (Zoom, Adobe,
// CRM, hosting). Flags potentially unused (used_seats < 50% of seats, or
// last_used > 30 days, or marked inactive).
const SubscriptionAnalyzer: React.FC = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [vendor, setVendor] = useState('');
  const [product, setProduct] = useState('');
  const [cost, setCost] = useState('');
  const [cycle, setCycle] = useState<Subscription['billing_cycle']>('monthly');
  const [renewal, setRenewal] = useState('');
  const [seats, setSeats] = useState('');
  const [used, setUsed] = useState('');

  const { data: subs = [] } = useQuery({
    queryKey: ['subscriptions', uid],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', uid)
        .order('monthly_cost', { ascending: false });
      if (error) throw error;
      return (data || []) as Subscription[];
    },
    enabled: !!uid,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in');
      if (!vendor || !product || !cost) throw new Error('Vendor, product and cost required');
      const { error } = await supabase.from('subscriptions').insert({
        user_id: uid,
        vendor_name: vendor,
        product_name: product,
        monthly_cost: Number(cost),
        billing_cycle: cycle,
        next_renewal_date: renewal || null,
        seats: seats ? Number(seats) : null,
        used_seats: used ? Number(used) : null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Subscription tracked' });
      qc.invalidateQueries({ queryKey: ['subscriptions', uid] });
      setVendor(''); setProduct(''); setCost(''); setRenewal(''); setSeats(''); setUsed('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscriptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions', uid] }),
  });

  const totals = useMemo(() => {
    const monthly = subs.reduce((s, x) => s + Number(x.monthly_cost), 0);
    const yearly = monthly * 12;
    const flagged: Subscription[] = subs.filter((s) => {
      if (!s.is_active) return true;
      if (s.seats && s.used_seats !== null && s.used_seats !== undefined) {
        if (s.seats > 0 && (s.used_seats / s.seats) < 0.5) return true;
      }
      if (s.last_used_at) {
        const last = new Date(s.last_used_at);
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
        if (last < cutoff) return true;
      }
      return false;
    });
    const wastedMonthly = flagged.reduce((s, x) => s + Number(x.monthly_cost), 0);
    return { monthly, yearly, flagged, wastedMonthly };
  }, [subs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Subscription Cost Analyzer
        </CardTitle>
        <CardDescription>
          Track recurring software (Zoom, Adobe, CRM, hosting) and flag unused seats.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Tools tracked</div>
            <div className="text-lg font-semibold">{subs.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Monthly cost</div>
            <div className="text-lg font-semibold">{formatINR(totals.monthly)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Annualised</div>
            <div className="text-lg font-semibold">{formatINR(totals.yearly)}</div>
          </CardContent></Card>
          <Card className={totals.flagged.length ? 'bg-amber-50 border-amber-200' : ''}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Flagged unused
            </div>
            <div className="text-lg font-semibold text-amber-700">{formatINR(totals.wastedMonthly)}/mo</div>
            <div className="text-xs">{totals.flagged.length} tools</div>
          </CardContent></Card>
        </div>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-sm">New subscription</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div><Label className="text-xs">Vendor</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
              <div><Label className="text-xs">Product</Label><Input value={product} onChange={(e) => setProduct(e.target.value)} /></div>
              <div><Label className="text-xs">Monthly cost</Label><Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Cycle</Label>
                <Select value={cycle} onValueChange={(v) => setCycle(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Seats</Label><Input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} /></div>
              <div><Label className="text-xs">Used seats</Label><Input type="number" value={used} onChange={(e) => setUsed(e.target.value)} /></div>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <Label className="text-xs">Next renewal</Label>
                <Input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} className="max-w-xs" />
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Track
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Cost / mo</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No subscriptions tracked.</TableCell></TableRow>
              )}
              {subs.map((s) => {
                const usedPct = s.seats && s.used_seats !== undefined && s.used_seats !== null && s.seats > 0
                  ? (s.used_seats / s.seats) * 100 : null;
                const isUnused = !s.is_active || (usedPct !== null && usedPct < 50);
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.vendor_name}</TableCell>
                    <TableCell>{s.product_name}</TableCell>
                    <TableCell className="text-right">{formatINR(s.monthly_cost)}</TableCell>
                    <TableCell><Badge variant="outline">{s.billing_cycle}</Badge></TableCell>
                    <TableCell className="text-right">{s.seats ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {s.used_seats ?? '—'}
                      {usedPct !== null && (
                        <span className={`text-xs ml-1 ${usedPct < 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          ({usedPct.toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{s.next_renewal_date || '—'}</TableCell>
                    <TableCell>
                      {isUnused
                        ? <Badge variant="destructive">Unused</Badge>
                        : <Badge variant="default">Active</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default SubscriptionAnalyzer;
