import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  MapPin, Plus, Star, Trash2, Edit, Building2, Truck, CheckCircle2,
} from 'lucide-react';
import {
  listPartyAddresses, upsertPartyAddress, deletePartyAddress, GST_STATES,
  type PartyAddress,
} from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface Props {
  partyType: 'customer' | 'vendor';
  partyId?: string | null;       // optional — UI shows party picker if missing
}

const EMPTY_FORM = (partyType: 'customer' | 'vendor', partyId: string, addressType: 'billing' | 'shipping'): Partial<PartyAddress> => ({
  party_type: partyType,
  party_id: partyId,
  address_type: addressType,
  label: addressType === 'billing' ? 'Primary Billing' : 'Primary Shipping',
  address_line1: '',
  address_line2: '',
  city: '',
  district: '',
  state: '',
  state_code: '',
  country: 'India',
  pincode: '',
  gstin: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  is_default: false,
  is_active: true,
});

const AddressBookPanel: React.FC<Props> = ({ partyType, partyId: initialPartyId }) => {
  const { user } = useUser();
  const userId = user?.id;
  const qc = useQueryClient();
  const [partyId, setPartyId] = useState<string>(initialPartyId ?? '');
  const [editForm, setEditForm] = useState<Partial<PartyAddress> | null>(null);
  const [dlgOpen, setDlgOpen] = useState(false);

  const parties = useQuery({
    queryKey: ['parties-for-address', userId, partyType],
    queryFn: async () => {
      if (!userId) return [];
      const table = partyType === 'customer' ? 'clients' : 'vendors';
      const { data } = await supabase
        .from(table)
        .select('id,name')
        .eq('user_id', userId)
        .order('name')
        .limit(200);
      return data ?? [];
    },
    enabled: !!userId && !initialPartyId,
  });

  const addresses = useQuery({
    queryKey: ['party-addresses', userId, partyType, partyId],
    queryFn: () => userId && partyId
      ? listPartyAddresses(userId, partyType, partyId)
      : Promise.resolve([] as PartyAddress[]),
    enabled: !!userId && !!partyId,
  });

  const save = useMutation({
    mutationFn: async () => userId && editForm ? upsertPartyAddress(userId, editForm) : null,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['party-addresses'] });
      setDlgOpen(false); setEditForm(null);
      toast({ title: 'Saved', description: 'Address updated.' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => deletePartyAddress(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['party-addresses'] });
      toast({ title: 'Deleted' });
    },
  });

  const billing = (addresses.data ?? []).filter(a => a.address_type === 'billing');
  const shipping = (addresses.data ?? []).filter(a => a.address_type === 'shipping');

  const handleOpenNew = (addressType: 'billing' | 'shipping') => {
    if (!partyId) return;
    setEditForm(EMPTY_FORM(partyType, partyId, addressType));
    setDlgOpen(true);
  };

  const handleEdit = (a: PartyAddress) => { setEditForm(a); setDlgOpen(true); };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600"/>
            {partyType === 'customer' ? 'Customer' : 'Vendor'} Address Book
          </CardTitle>
          <CardDescription>
            Manage separate billing (used for invoices + GST) and multiple shipping addresses (used for delivery challans + e-way bills + POS).
          </CardDescription>
        </CardHeader>
        {!initialPartyId && (
          <CardContent>
            <div className="space-y-1.5 max-w-md">
              <Label>Choose {partyType}</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder={`Pick a ${partyType}`}/></SelectTrigger>
                <SelectContent>
                  {(parties.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {partyId && (
        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing" className="gap-1.5"><Building2 className="h-3.5 w-3.5"/>Billing ({billing.length})</TabsTrigger>
            <TabsTrigger value="shipping" className="gap-1.5"><Truck className="h-3.5 w-3.5"/>Shipping ({shipping.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="mt-4">
            <AddressTable
              addresses={billing}
              addressType="billing"
              onNew={() => handleOpenNew('billing')}
              onEdit={handleEdit}
              onDelete={(id) => del.mutate(id)}
            />
          </TabsContent>
          <TabsContent value="shipping" className="mt-4">
            <AddressTable
              addresses={shipping}
              addressType="shipping"
              onNew={() => handleOpenNew('shipping')}
              onEdit={handleEdit}
              onDelete={(id) => del.mutate(id)}
            />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editForm?.id ? 'Edit' : 'New'} {editForm?.address_type === 'billing' ? 'Billing' : 'Shipping'} Address
            </DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Label</Label>
                <Input value={editForm.label ?? ''} onChange={e => setEditForm({...editForm, label: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>Contact Person</Label>
                <Input value={editForm.contact_person ?? ''} onChange={e => setEditForm({...editForm, contact_person: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>Contact Phone</Label>
                <Input value={editForm.contact_phone ?? ''} onChange={e => setEditForm({...editForm, contact_phone: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>Contact Email</Label>
                <Input value={editForm.contact_email ?? ''} onChange={e => setEditForm({...editForm, contact_email: e.target.value})}/></div>
              <div className="space-y-1.5 col-span-2"><Label>Address Line 1 <span className="text-red-500">*</span></Label>
                <Input value={editForm.address_line1 ?? ''} onChange={e => setEditForm({...editForm, address_line1: e.target.value})}/></div>
              <div className="space-y-1.5 col-span-2"><Label>Address Line 2</Label>
                <Input value={editForm.address_line2 ?? ''} onChange={e => setEditForm({...editForm, address_line2: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>City</Label>
                <Input value={editForm.city ?? ''} onChange={e => setEditForm({...editForm, city: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>District</Label>
                <Input value={editForm.district ?? ''} onChange={e => setEditForm({...editForm, district: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>State (GST)</Label>
                <Select value={editForm.state_code ?? ''} onValueChange={v => {
                  const s = GST_STATES.find(s => s.code === v);
                  setEditForm({...editForm, state_code: v, state: s?.name ?? null});
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose state"/></SelectTrigger>
                  <SelectContent>{GST_STATES.map(s => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Country</Label>
                <Input value={editForm.country ?? 'India'} onChange={e => setEditForm({...editForm, country: e.target.value})}/></div>
              <div className="space-y-1.5"><Label>Pincode</Label>
                <Input value={editForm.pincode ?? ''} onChange={e => setEditForm({...editForm, pincode: e.target.value})} maxLength={6}/></div>
              <div className="space-y-1.5"><Label>GSTIN (this address)</Label>
                <Input value={editForm.gstin ?? ''} onChange={e => setEditForm({...editForm, gstin: e.target.value})} maxLength={15} placeholder="15-char GSTIN"/></div>
              <div className="col-span-2 flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editForm.is_default ?? false}
                    onChange={e => setEditForm({...editForm, is_default: e.target.checked})}/>
                  Default {editForm.address_type === 'billing' ? 'billing' : 'shipping'} address
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editForm.is_active ?? true}
                    onChange={e => setEditForm({...editForm, is_active: e.target.checked})}/>
                  Active
                </label>
              </div>
              <div className="col-span-2 flex gap-2 pt-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending} className="flex-1">
                  {save.isPending ? 'Saving…' : 'Save Address'}
                </Button>
                <Button variant="outline" onClick={() => { setDlgOpen(false); setEditForm(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const AddressTable: React.FC<{
  addresses: PartyAddress[]; addressType: 'billing' | 'shipping';
  onNew: () => void; onEdit: (a: PartyAddress) => void; onDelete: (id: string) => void;
}> = ({ addresses, addressType, onNew, onEdit, onDelete }) => (
  <Card>
    <CardHeader>
      <div className="flex justify-between items-start">
        <div>
          <CardTitle className="text-base">
            {addressType === 'billing' ? 'Billing Addresses' : 'Shipping Addresses'}
          </CardTitle>
          <CardDescription>
            {addressType === 'billing'
              ? 'Used for invoices, GST returns, AR/AP, customer statements.'
              : 'Used for delivery challans, e-way bills, place of supply, stock transfers.'}
          </CardDescription>
        </div>
        <Button size="sm" onClick={onNew} className="gap-2"><Plus className="h-4 w-4"/>Add</Button>
      </div>
    </CardHeader>
    <CardContent>
      {addresses.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No {addressType} addresses yet. Click Add to create one.
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Label</TableHead><TableHead>Address</TableHead>
            <TableHead>City / State</TableHead><TableHead>GSTIN</TableHead>
            <TableHead>Default</TableHead><TableHead className="w-24">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {addresses.map(a => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="font-medium">{a.label ?? '—'}</div>
                  {a.contact_person && <div className="text-xs text-muted-foreground">{a.contact_person}</div>}
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="text-sm truncate">{a.address_line1}</div>
                  {a.address_line2 && <div className="text-xs text-muted-foreground truncate">{a.address_line2}</div>}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{a.city ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{a.state_code ? `${a.state_code} — ` : ''}{a.state ?? a.country}</div>
                  {a.pincode && <div className="text-xs text-muted-foreground">PIN {a.pincode}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{a.gstin ?? '—'}</TableCell>
                <TableCell>
                  {a.is_default
                    ? <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Star className="h-3 w-3 mr-1 fill-amber-700"/>Default</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(a)}><Edit className="h-4 w-4"/></Button>
                    <Button variant="ghost" size="sm" onClick={() => a.id && onDelete(a.id)} className="text-red-600"><Trash2 className="h-4 w-4"/></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

export default AddressBookPanel;
