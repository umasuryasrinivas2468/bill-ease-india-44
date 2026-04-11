import React, { useEffect, useState } from 'react';
import { useClients } from '@/hooks/useClients';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const Payments: React.FC = () => {
  const { data: clients = [] } = useClients();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<any[]>([]);

  useEffect(()=>{ fetchLinks(); }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch('/payments/user/me');
      const json = await res.json();
      if (json.success) setLinks(json.data || []);
    } catch (e) { }
  };

  const handleSubmit = async () => {
    if (!amount || !clientId) { toast({ title: 'Validation', description: 'Amount and vendor required' }); return; }
    const client = clients.find((c:any)=> c.id === clientId);
    setLoading(true);
    try {
      const resp = await fetch('/payments/send-link', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: 'me', amount, description, customer: { name: client?.name, email: client?.email, contact: client?.phone } }) });
      const json = await resp.json();
      if (json.success) {
        toast({ title: 'Payment link created', description: 'Link created and email sent if configured' });
        fetchLinks();
      } else {
        toast({ title: 'Error', description: json.error || 'Failed to create link', variant: 'destructive' });
      }
    } catch (e:any) {
      toast({ title: 'Error', description: e.message || 'Failed to create link', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Payments</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2">
          <label className="text-sm font-medium">Amount</label>
          <Input value={amount} onChange={(e)=>setAmount((e.target as HTMLInputElement).value)} placeholder="Amount (INR)" />
          <label className="text-sm font-medium">Description</label>
          <Input value={description} onChange={(e)=>setDescription((e.target as HTMLInputElement).value)} placeholder="Description for payer" />
        </div>

        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-medium">Vendor</label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Select vendor (client)" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c:any)=> <SelectItem key={c.id} value={c.id}>{c.name} — {c.email}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="pt-2">
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Creating...' : 'Send Payment Link'}</Button>
          </div>

          <div className="mt-4">
            <h2 className="font-medium">Recent Links</h2>
            <ul className="space-y-2 mt-2">
              {links.map(l=> (
                <li key={l.id} className="p-2 border rounded flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium">{l.meta?.customer?.name || l.meta?.customer?.email}</div>
                    <div className="text-xs text-muted-foreground">{l.short_url}</div>
                  </div>
                  <a className="text-sm underline" href={l.short_url} target="_blank" rel="noreferrer">Open</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payments;
