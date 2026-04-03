import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useTDSRules } from '@/hooks/useTDSRules';
import { Upload } from 'lucide-react';
import ImportDialog from '@/components/ImportDialog';
import { GST_TREATMENTS, INDIAN_STATES } from '@/constants/india';

interface VendorRecord {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  pan?: string;
  gst_number?: string;
  gst_treatment?: string;
  state?: string;
  msme_registered?: boolean;
  udyam_aadhaar?: string;
  bank_account_holder?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  bank_branch?: string;
  linked_tds_section_id?: string | null;
  tds_enabled?: boolean;
}

export default function Vendors() {
  const { user } = useUser();
  const { toast } = useToast();
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VendorRecord | null>(null);
  const { data: tdsRules = [] } = useTDSRules();

  const emptyForm: Partial<VendorRecord> = {
    name: '',
    company_name: '',
    email: '',
    phone: '',
    address: '',
    pan: '',
    gst_number: '',
    gst_treatment: '',
    state: '',
    msme_registered: false,
    udyam_aadhaar: '',
    bank_account_holder: '',
    bank_account_number: '',
    bank_ifsc: '',
    bank_name: '',
    bank_branch: '',
    linked_tds_section_id: null,
    tds_enabled: false,
  };

  const [form, setForm] = useState<Partial<VendorRecord>>(emptyForm);

  useEffect(() => {
    if (user) fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, company_name, email, phone, address, pan, gst_number, gst_treatment, state, msme_registered, udyam_aadhaar, bank_account_holder, bank_account_number, bank_ifsc, bank_name, bank_branch, linked_tds_section_id, tds_enabled')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVendors((data || []) as any);
    } catch (err) {
      console.error('fetch vendors error', err);
      toast({ title: 'Error', description: 'Unable to load vendors', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsOpen(true);
  };

  const openEdit = (v: VendorRecord) => {
    setEditing(v);
    setForm({ ...v });
    setIsOpen(true);
  };

  const save = async () => {
    if (!form.name || form.name.trim() === '') {
      toast({ title: 'Validation', description: 'Vendor name is required' });
      return;
    }
    if (!form.company_name || form.company_name.trim() === '') {
      toast({ title: 'Validation', description: 'Company name is required' });
      return;
    }
    if (form.msme_registered && (!form.udyam_aadhaar || form.udyam_aadhaar.trim() === '')) {
      toast({ title: 'Validation', description: 'Udyam Aadhaar number is required for MSME vendors' });
      return;
    }

    try {
      const payload = {
        name: form.name,
        company_name: form.company_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        pan: form.pan,
        gst_number: form.gst_number,
        gst_treatment: form.gst_treatment || null,
        state: form.state || null,
        msme_registered: form.msme_registered || false,
        udyam_aadhaar: form.msme_registered ? form.udyam_aadhaar : null,
        bank_account_holder: form.bank_account_holder,
        bank_account_number: form.bank_account_number,
        bank_ifsc: form.bank_ifsc,
        bank_name: form.bank_name,
        bank_branch: form.bank_branch,
        linked_tds_section_id: form.linked_tds_section_id,
        tds_enabled: form.tds_enabled || false,
      };

      if (editing) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Vendor updated' });
      } else {
        const { error } = await supabase.from('vendors').insert([{ 
          user_id: user?.id,
          ...payload,
        }]);
        if (error) throw error;
        toast({ title: 'Vendor created' });
      }

      setIsOpen(false);
      fetchVendors();
    } catch (err) {
      console.error('save vendor error', err);
      toast({ title: 'Error', description: 'Unable to save vendor', variant: 'destructive' });
    }
  };

  const handleImportVendors = async (validRows: any[]) => {
    try {
      const vendorsToInsert = validRows.map((row) => ({
        user_id: user?.id,
        name: row.vendor_name,
        company_name: row.company_name || row.vendor_name,
        email: row.email || '',
        phone: row.phone || '',
        address: row.billing_address || '',
        pan: row.pan || '',
        gst_number: row.gst || row.gst_number || '',
      }));

      const { error } = await supabase.from('vendors').insert(vendorsToInsert);
      if (error) throw error;

      setIsImportDialogOpen(false);
      fetchVendors();
      toast({
        title: 'Import Successful',
        description: `${validRows.length} vendors imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import vendors. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Vendors</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={openCreate}>New Vendor</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>TDS</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.company_name || '-'}</TableCell>
                  <TableCell>{v.gst_number || '-'}</TableCell>
                  <TableCell>{v.state || '-'}</TableCell>
                  <TableCell>{v.email || '-'}</TableCell>
                  <TableCell>{v.phone || '-'}</TableCell>
                  <TableCell>{v.tds_enabled ? 'Enabled' : 'Disabled'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {vendors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No vendors found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Vendor Name</Label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input value={form.company_name || ''} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>PAN</Label>
              <Input value={form.pan || ''} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
            </div>
            <div>
              <Label>GST</Label>
              <Input value={form.gst_number || ''} onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>GST Treatment</Label>
              <Select value={form.gst_treatment || undefined} onValueChange={(value) => setForm({ ...form, gst_treatment: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select GST treatment" />
                </SelectTrigger>
                <SelectContent>
                  {GST_TREATMENTS.map((treatment) => (
                    <SelectItem key={treatment} value={treatment}>{treatment}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State</Label>
              <Select value={form.state || undefined} onValueChange={(value) => setForm({ ...form, state: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                checked={!!form.msme_registered}
                onCheckedChange={(value) => setForm({ ...form, msme_registered: !!value, udyam_aadhaar: !!value ? form.udyam_aadhaar : '' })}
              />
              <Label>MSME / Udyam registered</Label>
            </div>

            {form.msme_registered && (
              <div className="md:col-span-2">
                <Label>Udyam Aadhaar Number</Label>
                <Input value={form.udyam_aadhaar || ''} onChange={(e) => setForm({ ...form, udyam_aadhaar: e.target.value.toUpperCase() })} />
              </div>
            )}

            <div className="md:col-span-2">
              <h3 className="text-sm font-semibold">Bank Account Details</h3>
            </div>
            <div>
              <Label>Account Holder Name</Label>
              <Input value={form.bank_account_holder || ''} onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })} />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input value={form.bank_account_number || ''} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
            </div>
            <div>
              <Label>IFSC Code</Label>
              <Input value={form.bank_ifsc || ''} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input value={form.bank_name || ''} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div>
              <Label>Branch</Label>
              <Input value={form.bank_branch || ''} onChange={(e) => setForm({ ...form, bank_branch: e.target.value })} />
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox checked={!!form.tds_enabled} onCheckedChange={(v) => setForm({ ...form, tds_enabled: !!v })} />
              <Label>Enable TDS for this vendor</Label>
            </div>

            {form.tds_enabled && (
              <div className="md:col-span-2">
                <Label>TDS Rule</Label>
                <Select value={form.linked_tds_section_id || undefined} onValueChange={(value) => setForm({ ...form, linked_tds_section_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a TDS rule" />
                  </SelectTrigger>
                  <SelectContent>
                    {tdsRules.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{`${r.category} - ${r.description || ''} (${r.rate_percentage}%)`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        moduleKey="vendors"
        onConfirmImport={handleImportVendors}
      />
    </div>
  );
}
