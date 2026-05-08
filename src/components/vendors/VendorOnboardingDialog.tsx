import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, FileText, Trash2, Upload, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { GST_TREATMENTS, INDIAN_STATES } from '@/constants/india';
import {
  VENDOR_DOCUMENT_DESCRIPTORS,
  VendorDocumentDescriptor,
  VendorDocumentRow,
  fetchVendorDocuments,
  uploadVendorDocument,
  deleteVendorDocument,
  summarizeMissingRequiredDocs,
} from '@/lib/vendorDocuments';

const INCORPORATION_OPTIONS = [
  { value: 'proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership',    label: 'Partnership Firm' },
  { value: 'llp',            label: 'LLP' },
  { value: 'pvt_ltd',        label: 'Private Limited' },
  { value: 'public_ltd',     label: 'Public Limited' },
  { value: 'opc',            label: 'One Person Company (OPC)' },
  { value: 'huf',            label: 'HUF' },
  { value: 'trust',          label: 'Trust' },
  { value: 'society',        label: 'Society' },
  { value: 'other',          label: 'Other' },
];

const E_INVOICE_TURNOVER_THRESHOLD = 50000000; // ₹5 Cr (current applicability threshold)

interface VendorOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId?: string | null;
  onComplete?: (vendorId: string) => void;
}

interface VendorForm {
  id?: string;
  name: string;
  vendor_code: string;
  company_name: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  pan: string;
  gst_number: string;
  gst_treatment: string;
  msme_registered: boolean;
  udyam_aadhaar: string;
  incorporation_type: string;
  cin_number: string;
  annual_turnover: string;
  turnover_fy: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  declaration_206cca_206ab: boolean;
  einvoice_non_applicable_declared: boolean;
  it_declaration_received: boolean;
  itr_filed_years: string[];
}

const blankForm = (): VendorForm => ({
  name: '',
  vendor_code: '',
  company_name: '',
  email: '',
  phone: '',
  address: '',
  state: '',
  pan: '',
  gst_number: '',
  gst_treatment: '',
  msme_registered: false,
  udyam_aadhaar: '',
  incorporation_type: '',
  cin_number: '',
  annual_turnover: '',
  turnover_fy: '',
  bank_account_holder: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_name: '',
  bank_branch: '',
  declaration_206cca_206ab: false,
  einvoice_non_applicable_declared: false,
  it_declaration_received: false,
  itr_filed_years: [],
});

const currentFY = () => {
  const today = new Date();
  const year = today.getFullYear();
  // Indian FY: April → March
  const startYear = today.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

const lastNFinancialYears = (n: number) => {
  const today = new Date();
  const year = today.getFullYear();
  const startYear = today.getMonth() >= 3 ? year : year - 1;
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const s = startYear - i;
    out.push(`${s}-${String((s + 1) % 100).padStart(2, '0')}`);
  }
  return out;
};

const VendorOnboardingDialog: React.FC<VendorOnboardingDialogProps> = ({
  open, onOpenChange, vendorId, onComplete,
}) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'basic' | 'documents' | 'banking' | 'declarations'>('basic');
  const [form, setForm] = useState<VendorForm>(blankForm());
  const [documents, setDocuments] = useState<VendorDocumentRow[]>([]);
  const [savingBasic, setSavingBasic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const editingId = form.id || vendorId || null;

  useEffect(() => {
    if (!open) return;
    if (vendorId) {
      hydrateExisting(vendorId);
    } else {
      setForm(blankForm());
      setDocuments([]);
      setActiveTab('basic');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendorId]);

  const hydrateExisting = async (id: string) => {
    try {
      const { data } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (data) {
        const v = data as any;
        setForm({
          id: v.id,
          name: v.name || '',
          vendor_code: v.vendor_code || '',
          company_name: v.company_name || '',
          email: v.email || '',
          phone: v.phone || '',
          address: v.address || '',
          state: v.state || '',
          pan: v.pan || '',
          gst_number: v.gst_number || '',
          gst_treatment: v.gst_treatment || '',
          msme_registered: !!v.msme_registered,
          udyam_aadhaar: v.udyam_aadhaar || '',
          incorporation_type: v.incorporation_type || '',
          cin_number: v.cin_number || '',
          annual_turnover: v.annual_turnover ? String(v.annual_turnover) : '',
          turnover_fy: v.turnover_fy || currentFY(),
          bank_account_holder: v.bank_account_holder || '',
          bank_account_number: v.bank_account_number || '',
          bank_ifsc: v.bank_ifsc || '',
          bank_name: v.bank_name || '',
          bank_branch: v.bank_branch || '',
          declaration_206cca_206ab: !!v.declaration_206cca_206ab,
          einvoice_non_applicable_declared: !!v.einvoice_non_applicable_declared,
          it_declaration_received: !!v.it_declaration_received,
          itr_filed_years: Array.isArray(v.itr_filed_years) ? v.itr_filed_years : [],
        });
      }
      const docs = await fetchVendorDocuments(user!.id, id);
      setDocuments(docs);
    } catch (err) {
      console.error('hydrate vendor error', err);
    }
  };

  const missingDocs = useMemo<VendorDocumentDescriptor[]>(
    () => summarizeMissingRequiredDocs(documents, form.msme_registered),
    [documents, form.msme_registered]
  );

  const documentsByType = useMemo(() => {
    const map: Record<string, VendorDocumentRow> = {};
    for (const d of documents) map[d.document_type] = d;
    return map;
  }, [documents]);

  const persistBasicAndAdvance = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast({ title: 'Vendor name is required', variant: 'destructive' }); return; }
    if (!form.company_name.trim()) { toast({ title: 'Company name is required', variant: 'destructive' }); return; }
    if (!form.vendor_code.trim()) { toast({ title: 'Vendor code is required', variant: 'destructive' }); return; }

    const turnoverNum = form.annual_turnover ? Number(form.annual_turnover) : null;
    const einvoice_applicable = turnoverNum !== null ? turnoverNum >= E_INVOICE_TURNOVER_THRESHOLD : null;

    setSavingBasic(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        vendor_code: form.vendor_code.trim(),
        company_name: form.company_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        state: form.state || null,
        pan: form.pan.trim().toUpperCase() || null,
        gst_number: form.gst_number.trim().toUpperCase() || null,
        gst_treatment: form.gst_treatment || null,
        msme_registered: form.msme_registered,
        udyam_aadhaar: form.msme_registered ? (form.udyam_aadhaar || null) : null,
        incorporation_type: form.incorporation_type || null,
        cin_number: form.cin_number.trim().toUpperCase() || null,
        annual_turnover: turnoverNum,
        turnover_fy: form.turnover_fy || null,
        einvoice_applicable,
        onboarding_status: 'draft',
      };

      let id = form.id;
      if (id) {
        const { error } = await supabase.from('vendors').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('vendors')
          .insert([{ user_id: user.id, ...payload }])
          .select('id')
          .single();
        if (error) throw error;
        id = (data as any).id;
        setForm((prev) => ({ ...prev, id: id! }));
      }

      // Refresh document list after we have an id (no-op for new vendors)
      if (id) {
        const docs = await fetchVendorDocuments(user.id, id);
        setDocuments(docs);
      }

      toast({ title: 'Basic details saved', description: 'Continue to upload documents.' });
      setActiveTab('documents');
    } catch (err: any) {
      console.error('save vendor basic error', err);
      toast({
        title: 'Error',
        description: err?.message || 'Could not save vendor details',
        variant: 'destructive',
      });
    } finally {
      setSavingBasic(false);
    }
  };

  const handleFileUpload = async (descriptor: VendorDocumentDescriptor, file: File) => {
    if (!user || !editingId) {
      toast({ title: 'Save basic details first', variant: 'destructive' });
      return;
    }
    setUploadingType(descriptor.type);
    try {
      const row = await uploadVendorDocument(user.id, editingId, descriptor.type, descriptor.label, file);
      setDocuments((prev) => {
        const filtered = prev.filter((d) => d.document_type !== descriptor.type);
        return [row, ...filtered];
      });
      toast({ title: `${descriptor.label} uploaded` });
    } catch (err: any) {
      console.error('upload error', err);
      toast({ title: 'Upload failed', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setUploadingType(null);
    }
  };

  const handleFileDelete = async (doc: VendorDocumentRow) => {
    if (!user) return;
    try {
      await deleteVendorDocument(user.id, doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast({ title: 'Document removed' });
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message || 'Try again', variant: 'destructive' });
    }
  };

  const submitOnboarding = async () => {
    if (!user || !editingId) return;
    if (!form.declaration_206cca_206ab) {
      toast({ title: 'Confirm 206CCA / 206AB declaration to continue', variant: 'destructive' });
      return;
    }
    if (!form.it_declaration_received) {
      toast({ title: 'Confirm IT declaration to continue', variant: 'destructive' });
      return;
    }
    if (missingDocs.length > 0) {
      toast({
        title: 'Missing required documents',
        description: `Upload: ${missingDocs.map((d) => d.label).join(', ')}`,
        variant: 'destructive',
      });
      setActiveTab('documents');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        bank_account_holder: form.bank_account_holder.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        bank_ifsc: form.bank_ifsc.trim().toUpperCase() || null,
        bank_name: form.bank_name.trim() || null,
        bank_branch: form.bank_branch.trim() || null,
        declaration_206cca_206ab: form.declaration_206cca_206ab,
        einvoice_non_applicable_declared: form.einvoice_non_applicable_declared,
        it_declaration_received: form.it_declaration_received,
        itr_filed_years: form.itr_filed_years,
        onboarding_status: 'submitted',
        onboarding_completed_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('vendors').update(payload).eq('id', editingId);
      if (error) throw error;

      toast({
        title: 'Vendor onboarding submitted',
        description: 'All required documents and declarations recorded.',
      });
      onComplete?.(editingId);
      onOpenChange(false);
    } catch (err: any) {
      console.error('submit onboarding error', err);
      toast({ title: 'Submission failed', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const turnoverNum = form.annual_turnover ? Number(form.annual_turnover) : NaN;
  const einvoiceApplies = Number.isFinite(turnoverNum) && turnoverNum >= E_INVOICE_TURNOVER_THRESHOLD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendor Onboarding</DialogTitle>
          <DialogDescription>
            Capture vendor details, KYC documents, banking info and statutory declarations to verify and onboard.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">1. Basic Details</TabsTrigger>
            <TabsTrigger value="documents" disabled={!editingId}>2. Documents</TabsTrigger>
            <TabsTrigger value="banking" disabled={!editingId}>3. Banking</TabsTrigger>
            <TabsTrigger value="declarations" disabled={!editingId}>4. Declarations</TabsTrigger>
          </TabsList>

          {/* ─────────────────────────── Step 1 ─────────────────────────── */}
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Vendor Code *</Label>
                <Input value={form.vendor_code}
                  onChange={(e) => setForm({ ...form, vendor_code: e.target.value.toUpperCase() })}
                  placeholder="e.g. VEN-001" />
              </div>
              <div>
                <Label>Vendor Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Company Name *</Label>
                <Input value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div>
                <Label>Incorporation Type</Label>
                <Select value={form.incorporation_type || undefined}
                  onValueChange={(v) => setForm({ ...form, incorporation_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
                  <SelectContent>
                    {INCORPORATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.incorporation_type === 'pvt_ltd' || form.incorporation_type === 'public_ltd' || form.incorporation_type === 'llp' || form.incorporation_type === 'opc') && (
                <div>
                  <Label>CIN / LLPIN</Label>
                  <Input value={form.cin_number}
                    onChange={(e) => setForm({ ...form, cin_number: e.target.value.toUpperCase() })}
                    placeholder="e.g. U72200KA2010PTC123456" />
                </div>
              )}
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>PAN</Label>
                <Input value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F" />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={form.gst_number}
                  onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })}
                  placeholder="22ABCDE1234F1Z5" />
              </div>
              <div>
                <Label>GST Treatment</Label>
                <Select value={form.gst_treatment || undefined}
                  onValueChange={(v) => setForm({ ...form, gst_treatment: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {GST_TREATMENTS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>State</Label>
                <Select value={form.state || undefined}
                  onValueChange={(v) => setForm({ ...form, state: v })}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Address</Label>
                <Input value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>

              <div>
                <Label>Annual Turnover (₹) *</Label>
                <Input type="number" min="0" step="1000" value={form.annual_turnover}
                  onChange={(e) => setForm({ ...form, annual_turnover: e.target.value })}
                  placeholder="e.g. 25000000" />
                <p className="text-xs text-muted-foreground mt-1">
                  E-invoice {einvoiceApplies ? <span className="text-orange-700 font-medium">applicable</span> : <span className="text-emerald-700 font-medium">not applicable</span>} at this turnover.
                </p>
              </div>
              <div>
                <Label>Turnover Financial Year</Label>
                <Input value={form.turnover_fy || currentFY()}
                  onChange={(e) => setForm({ ...form, turnover_fy: e.target.value })}
                  placeholder={currentFY()} />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 border rounded-md p-3 bg-muted/30">
                <Checkbox checked={form.msme_registered}
                  onCheckedChange={(v) => setForm({ ...form, msme_registered: !!v, udyam_aadhaar: v ? form.udyam_aadhaar : '' })} />
                <Label className="cursor-pointer">Vendor is MSME / Udyam registered</Label>
              </div>
              {form.msme_registered && (
                <div className="md:col-span-2">
                  <Label>Udyam Aadhaar Number</Label>
                  <Input value={form.udyam_aadhaar}
                    onChange={(e) => setForm({ ...form, udyam_aadhaar: e.target.value.toUpperCase() })} />
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={persistBasicAndAdvance} disabled={savingBasic}>
                {savingBasic ? 'Saving…' : (editingId ? 'Save & Continue' : 'Save & Continue')}
              </Button>
            </div>
          </TabsContent>

          {/* ─────────────────────────── Step 2 ─────────────────────────── */}
          <TabsContent value="documents" className="space-y-4">
            {missingDocs.length > 0 && (
              <Alert variant="default">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Documents required</AlertTitle>
                <AlertDescription>
                  Upload {missingDocs.length} more required document{missingDocs.length === 1 ? '' : 's'} to complete onboarding.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3">
              {VENDOR_DOCUMENT_DESCRIPTORS.map((d) => {
                if (d.type === 'msme_certificate' && !form.msme_registered) return null;
                const existing = documentsByType[d.type];
                const isUploading = uploadingType === d.type;
                return (
                  <Card key={d.type} className={existing ? 'border-emerald-300 bg-emerald-50/40' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium truncate">{d.label}</span>
                            {d.required && !existing && (
                              <Badge variant="outline" className="text-orange-700 border-orange-300">Required</Badge>
                            )}
                            {existing && (
                              <Badge className="bg-emerald-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Uploaded
                              </Badge>
                            )}
                          </div>
                          {d.description && (
                            <p className="text-xs text-muted-foreground mt-1">{d.description}</p>
                          )}
                          {existing?.file_name && (
                            <p className="text-xs text-emerald-700 mt-1 truncate">
                              {existing.file_name}
                              {existing.file_size ? ` · ${(Number(existing.file_size)/1024).toFixed(0)} KB` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {existing ? (
                            <>
                              {existing.file_data_url && (
                                <Button asChild size="sm" variant="outline">
                                  <a href={existing.file_data_url}
                                    download={existing.file_name || `${d.type}.bin`}
                                    target="_blank" rel="noreferrer">View</a>
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleFileDelete(existing)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <label className="inline-flex">
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleFileUpload(d, f);
                                  e.currentTarget.value = '';
                                }}
                              />
                              <Button asChild size="sm" disabled={isUploading}>
                                <span>
                                  <Upload className="h-4 w-4 mr-1" />
                                  {isUploading ? 'Uploading…' : 'Upload'}
                                </span>
                              </Button>
                            </label>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab('basic')}>Back</Button>
              <Button onClick={() => setActiveTab('banking')}>Continue</Button>
            </div>
          </TabsContent>

          {/* ─────────────────────────── Step 3 ─────────────────────────── */}
          <TabsContent value="banking" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Account Holder Name</Label>
                <Input value={form.bank_account_holder}
                  onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })} />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input value={form.bank_account_number}
                  onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
              </div>
              <div>
                <Label>IFSC Code</Label>
                <Input value={form.bank_ifsc}
                  onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <Label>Bank Name</Label>
                <Input value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              </div>
              <div>
                <Label>Branch</Label>
                <Input value={form.bank_branch}
                  onChange={(e) => setForm({ ...form, bank_branch: e.target.value })} />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              The cancelled cheque you uploaded under Documents is the supporting evidence for these details.
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab('documents')}>Back</Button>
              <Button onClick={() => setActiveTab('declarations')}>Continue</Button>
            </div>
          </TabsContent>

          {/* ─────────────────────────── Step 4 ─────────────────────────── */}
          <TabsContent value="declarations" className="space-y-4">
            <div>
              <Label className="text-sm font-medium">IT Returns filed (last 3 years)</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {lastNFinancialYears(3).map((fy) => (
                  <label key={fy} className="flex items-center gap-2 border rounded-md p-2 cursor-pointer">
                    <Checkbox
                      checked={form.itr_filed_years.includes(fy)}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...form.itr_filed_years, fy]
                          : form.itr_filed_years.filter((x) => x !== fy);
                        setForm({ ...form, itr_filed_years: next });
                      }}
                    />
                    <span className="text-sm">FY {fy}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.declaration_206cca_206ab}
                  onCheckedChange={(v) => setForm({ ...form, declaration_206cca_206ab: !!v })}
                />
                <span className="text-sm">
                  <span className="font-medium">Declaration — Section 206CCA / 206AB:</span>{' '}
                  Vendor confirms they have filed their Income Tax returns for the past relevant
                  years and are not a "specified person" attracting higher TDS / TCS under
                  sections 206AB / 206CCA. <span className="text-red-600">*</span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.einvoice_non_applicable_declared}
                  disabled={einvoiceApplies}
                  onCheckedChange={(v) => setForm({ ...form, einvoice_non_applicable_declared: !!v })}
                />
                <span className="text-sm">
                  <span className="font-medium">Declaration — E-Invoice not applicable:</span>{' '}
                  Vendor's aggregate turnover is below the e-invoicing threshold and they confirm
                  e-invoicing rules do not apply.
                  {einvoiceApplies && (
                    <span className="text-orange-700 ml-1">
                      Disabled — turnover ≥ ₹5 Cr makes e-invoice applicable.
                    </span>
                  )}
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={form.it_declaration_received}
                  onCheckedChange={(v) => setForm({ ...form, it_declaration_received: !!v })}
                />
                <span className="text-sm">
                  <span className="font-medium">Income Tax Declaration:</span>{' '}
                  Signed Income Tax Declaration form has been received from the vendor.
                  <span className="text-red-600"> *</span>
                </span>
              </label>
            </div>

            {missingDocs.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Missing documents</AlertTitle>
                <AlertDescription>
                  {missingDocs.map((d) => d.label).join(', ')}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab('banking')}>Back</Button>
              <Button onClick={submitOnboarding} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Vendor for Verification'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default VendorOnboardingDialog;
