import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Mail, Phone, MapPin, FileText, Users, Edit, Trash2, Upload, Building2, User, IndianRupee } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, Client } from '@/hooks/useClients';
import { useNavigate } from 'react-router-dom';
import { useInvoices } from '@/hooks/useInvoices';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import ImportDialog from '@/components/ImportDialog';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Delhi", "Jammu & Kashmir", "Ladakh", "Chandigarh", "Puducherry",
  "Andaman & Nicobar Islands", "Dadra & Nagar Haveli and Daman & Diu", "Lakshadweep",
];

const emptyClient = {
  name: '', email: '', phone: '', gst_number: '', address: '',
  client_type: 'business', salutation: '', first_name: '', last_name: '',
  company_name: '', display_name: '', language: 'English',
  gst_treatment: 'registered', place_of_supply: '', pan: '',
  tax_preference: 'taxable', currency: 'INR', opening_balance: 0, payment_terms: 30,
};

// Reusable client form
const ClientFormFields = ({ data, onChange }: { data: any; onChange: (d: any) => void }) => {
  const set = (field: string, value: any) => onChange({ ...data, [field]: value });
  return (
    <div className="grid gap-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
      {/* Type */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Client Type *</Label>
          <Select value={data.client_type || 'business'} onValueChange={v => set('client_type', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Currency</Label>
          <Select value={data.currency || 'INR'} onValueChange={v => set('currency', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="INR">INR (₹)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="GBP">GBP (£)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Primary Contact */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">PRIMARY CONTACT</p>
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Salutation</Label>
            <Select value={data.salutation || ''} onValueChange={v => set('salutation', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Mr.">Mr.</SelectItem>
                <SelectItem value="Mrs.">Mrs.</SelectItem>
                <SelectItem value="Ms.">Ms.</SelectItem>
                <SelectItem value="Dr.">Dr.</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-1">
            <Label className="text-xs">First Name</Label>
            <Input className="h-9" value={data.first_name || ''} onChange={e => set('first_name', e.target.value)} placeholder="First" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Last Name</Label>
            <Input className="h-9" value={data.last_name || ''} onChange={e => set('last_name', e.target.value)} placeholder="Last" />
          </div>
        </div>
      </div>

      {/* Company / Display Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{data.client_type === 'business' ? 'Company Name *' : 'Display Name *'}</Label>
          <Input className="h-9" value={data.company_name || ''} onChange={e => { set('company_name', e.target.value); if (!data.name || data.name === data.company_name) set('name', e.target.value); }} placeholder="Company name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Display Name</Label>
          <Input className="h-9" value={data.display_name || ''} onChange={e => set('display_name', e.target.value)} placeholder="Display name" />
        </div>
      </div>

      {/* Hidden: keep name in sync */}
      <input type="hidden" value={data.name || data.company_name || data.display_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()} />

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input className="h-9" type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input className="h-9" value={data.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
        </div>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <Label className="text-xs">Language</Label>
        <Select value={data.language || 'English'} onValueChange={v => set('language', v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="English">English</SelectItem>
            <SelectItem value="Hindi">Hindi</SelectItem>
            <SelectItem value="Tamil">Tamil</SelectItem>
            <SelectItem value="Telugu">Telugu</SelectItem>
            <SelectItem value="Kannada">Kannada</SelectItem>
            <SelectItem value="Malayalam">Malayalam</SelectItem>
            <SelectItem value="Marathi">Marathi</SelectItem>
            <SelectItem value="Bengali">Bengali</SelectItem>
            <SelectItem value="Gujarati">Gujarati</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* GST Details */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">GST DETAILS</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">GST Treatment</Label>
            <Select value={data.gst_treatment || 'registered'} onValueChange={v => set('gst_treatment', v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="registered">Registered Business - Regular</SelectItem>
                <SelectItem value="composition">Registered - Composition</SelectItem>
                <SelectItem value="unregistered">Unregistered Business</SelectItem>
                <SelectItem value="consumer">Consumer</SelectItem>
                <SelectItem value="overseas">Overseas</SelectItem>
                <SelectItem value="sez">SEZ</SelectItem>
                <SelectItem value="deemed_export">Deemed Export</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">GSTIN</Label>
            <Input className="h-9" value={data.gst_number || ''} onChange={e => set('gst_number', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Place of Supply</Label>
            <Select value={data.place_of_supply || ''} onValueChange={v => set('place_of_supply', v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>{INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">PAN</Label>
            <Input className="h-9" value={data.pan || ''} onChange={e => set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
          </div>
        </div>
        <div className="space-y-1.5 mt-3">
          <Label className="text-xs">Tax Preference</Label>
          <Select value={data.tax_preference || 'taxable'} onValueChange={v => set('tax_preference', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="taxable">Taxable</SelectItem>
              <SelectItem value="tax_exempt">Tax Exempt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Opening Balance & Payment Terms */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">PAYMENT</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Opening Balance (₹)</Label>
            <Input className="h-9" type="number" value={data.opening_balance || ''} onChange={e => set('opening_balance', Number(e.target.value) || 0)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment Terms (days)</Label>
            <Select value={String(data.payment_terms || 30)} onValueChange={v => set('payment_terms', Number(v))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Due on receipt</SelectItem>
                <SelectItem value="7">Net 7</SelectItem>
                <SelectItem value="15">Net 15</SelectItem>
                <SelectItem value="30">Net 30</SelectItem>
                <SelectItem value="45">Net 45</SelectItem>
                <SelectItem value="60">Net 60</SelectItem>
                <SelectItem value="90">Net 90</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <Label className="text-xs">Billing Address</Label>
        <Textarea value={data.address || ''} onChange={e => set('address', e.target.value)} placeholder="Enter billing address" rows={2} />
      </div>
    </div>
  );
};

const Clients = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState<any>({ ...emptyClient });

  const { data: clients = [], isLoading } = useClients();
  const { data: invoices = [] } = useInvoices();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const deleteClientMutation = useDeleteClient();

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (client.company_name && client.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getClientInvoiceCount = (clientId: string) => {
    return invoices.filter(invoice => invoice.client_name === clients.find(c => c.id === clientId)?.name).length;
  };

  const handleAddClient = async () => {
    const name = newClient.name || newClient.company_name || newClient.display_name || `${newClient.first_name || ''} ${newClient.last_name || ''}`.trim();
    if (!name) {
      toast({ title: "Validation Error", description: "Client/Company name is required.", variant: "destructive" });
      return;
    }
    try {
      await createClientMutation.mutateAsync({ ...newClient, name });
      toast({ title: "Client Added", description: `${name} has been added.` });
      setNewClient({ ...emptyClient });
      setIsAddDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to add client.", variant: "destructive" });
    }
  };

  const handleEditClient = async () => {
    if (!editingClient) return;
    const name = editingClient.name || editingClient.company_name || editingClient.display_name || `${editingClient.first_name || ''} ${editingClient.last_name || ''}`.trim();
    if (!name) {
      toast({ title: "Validation Error", description: "Client name is required.", variant: "destructive" });
      return;
    }
    try {
      await updateClientMutation.mutateAsync({ ...editingClient, name });
      toast({ title: "Client Updated", description: `${name} has been updated.` });
      setEditingClient(null);
    } catch {
      toast({ title: "Error", description: "Failed to update client.", variant: "destructive" });
    }
  };

  const handleDeleteClient = async (client: Client) => {
    if (window.confirm(`Are you sure you want to delete ${client.name}?`)) {
      try {
        await deleteClientMutation.mutateAsync(client.id);
        toast({ title: "Client Deleted", description: `${client.name} has been deleted.` });
      } catch {
        toast({ title: "Error", description: "Failed to delete client.", variant: "destructive" });
      }
    }
  };

  const viewClientInvoices = (client: Client) => navigate(`/invoices?client=${encodeURIComponent(client.name)}`);

  const handleImportClients = async (validRows: any[]) => {
    try {
      if (!user?.id) throw new Error('User not authenticated');
      const clientsToInsert = validRows.map((row) => ({
        user_id: user.id, name: row.client_name,
        email: row.email || null, phone: row.phone || null,
        gst_number: row.gst_number || null, address: row.billing_address || row.address || null,
      }));
      const { error } = await supabase.from('clients').insert(clientsToInsert);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      setIsImportDialogOpen(false);
      toast({ title: 'Import Successful', description: `${validRows.length} clients imported.` });
    } catch {
      toast({ title: 'Import Failed', description: 'Failed to import clients.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div><h1 className="text-2xl font-bold">Clients</h1><p className="text-muted-foreground">Loading...</p></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-6"><div className="animate-pulse space-y-4"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-200 rounded w-1/2" /></div></CardContent></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div><h1 className="text-2xl md:text-3xl font-bold">Clients</h1><p className="text-muted-foreground">Manage your client database</p></div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="orange"><Plus className="h-4 w-4 mr-2" /> Add Client</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add New Client</DialogTitle>
                <DialogDescription>Enter client details including contact, GST, and payment information.</DialogDescription>
              </DialogHeader>
              <ClientFormFields data={newClient} onChange={setNewClient} />
              <DialogFooter>
                <Button variant="orange" onClick={handleAddClient} disabled={createClientMutation.isPending}>
                  {createClientMutation.isPending ? "Adding..." : "Add Client"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}><Upload className="h-4 w-4 mr-2" /> Import</Button>
        </div>
      </div>

      <ImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} moduleKey="clients" onConfirmImport={handleImportClients} />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search clients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {filteredClients.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-muted-foreground">{searchTerm ? 'No clients found.' : 'No clients added yet.'}</div>
            {!searchTerm && <Button variant="orange" className="mt-4" onClick={() => setIsAddDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Your First Client</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredClients.map(client => (
            <Card key={client.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{client.display_name || client.company_name || client.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px]">{client.client_type === 'individual' ? 'Individual' : 'Business'}</Badge>
                    </div>
                    {(client.first_name || client.last_name) && (
                      <p className="text-xs text-muted-foreground mt-0.5">{client.salutation} {client.first_name} {client.last_name}</p>
                    )}
                    {client.email && <CardDescription className="flex items-center gap-1 mt-1"><Mail className="h-3 w-3" />{client.email}</CardDescription>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingClient(client)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClient(client)} className="text-red-600 hover:text-red-700"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1.5 text-sm">
                  {client.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" /><span>{client.phone}</span></div>}
                  {client.address && <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" /><span className="truncate">{client.address}</span></div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {client.gst_number && <Badge variant="secondary" className="text-[10px]">GSTIN: {client.gst_number}</Badge>}
                  {client.pan && <Badge variant="secondary" className="text-[10px]">PAN: {client.pan}</Badge>}
                  {client.gst_treatment && client.gst_treatment !== 'registered' && <Badge variant="outline" className="text-[10px]">{client.gst_treatment}</Badge>}
                  {client.place_of_supply && <Badge variant="outline" className="text-[10px]">{client.place_of_supply}</Badge>}
                  {client.payment_terms != null && <Badge variant="outline" className="text-[10px]">Net {client.payment_terms}</Badge>}
                  {client.opening_balance != null && client.opening_balance > 0 && <Badge variant="outline" className="text-[10px]">OB: ₹{client.opening_balance.toLocaleString('en-IN')}</Badge>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => viewClientInvoices(client)}>
                    <FileText className="h-3 w-3 mr-1" /> Invoices ({getClientInvoiceCount(client.id)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Client Dialog */}
      <Dialog open={!!editingClient} onOpenChange={() => setEditingClient(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client details.</DialogDescription>
          </DialogHeader>
          {editingClient && <ClientFormFields data={editingClient} onChange={setEditingClient} />}
          <DialogFooter>
            <Button variant="orange" onClick={handleEditClient} disabled={updateClientMutation.isPending}>
              {updateClientMutation.isPending ? "Updating..." : "Update Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Clients;
