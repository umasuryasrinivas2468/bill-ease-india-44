import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { useAssetCategories, useCreateAsset } from '@/hooks/useFixedAssets';
import { computeDepreciationPlan } from '@/services/depreciationService';
import type { DepreciationMethod, CreateAssetInput } from '@/types/fixedAssets';

const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const today = () => new Date().toISOString().slice(0, 10);

const CreateAsset: React.FC = () => {
  const navigate = useNavigate();
  const { data: categories = [] } = useAssetCategories();
  const create = useCreateAsset();

  const [form, setForm] = useState<CreateAssetInput>({
    name: '',
    purchase_value: 0,
    gst_amount: 0,
    purchase_date: today(),
    useful_life_years: 5,
    depreciation_method: 'SLM',
    depreciation_rate: undefined,
    salvage_value: 0,
    itc_eligible: true,
    payment_mode: 'credit',
    post_journal: true,
  });
  const [gstSplit, setGstSplit] = useState<'intra' | 'inter'>('intra');

  // When the user picks a category, apply its defaults (unless they already changed values).
  useEffect(() => {
    if (!form.category_id) return;
    const cat = categories.find((c) => c.id === form.category_id);
    if (!cat) return;
    setForm((prev) => ({
      ...prev,
      category_name: cat.name,
      useful_life_years: prev.useful_life_years === 5 ? cat.default_useful_life_years : prev.useful_life_years,
      depreciation_method: prev.depreciation_method === 'SLM' ? cat.default_depreciation_method : prev.depreciation_method,
      depreciation_rate: cat.default_depreciation_method === 'WDV' ? (cat.default_depreciation_rate ?? prev.depreciation_rate) : prev.depreciation_rate,
    }));
  }, [form.category_id, categories]);

  // Auto-split GST into CGST/SGST or IGST.
  useEffect(() => {
    const gst = Number(form.gst_amount || 0);
    if (gstSplit === 'inter') {
      setForm((p) => ({ ...p, cgst_amount: 0, sgst_amount: 0, igst_amount: gst }));
    } else {
      setForm((p) => ({ ...p, cgst_amount: gst / 2, sgst_amount: gst / 2, igst_amount: 0 }));
    }
  }, [form.gst_amount, gstSplit]);

  const capitalised = useMemo(() => {
    const pv = Number(form.purchase_value || 0);
    const gst = Number(form.gst_amount || 0);
    return pv + (form.itc_eligible ? 0 : gst);
  }, [form.purchase_value, form.gst_amount, form.itc_eligible]);

  const previewPlan = useMemo(() => {
    if (!form.purchase_value || !form.useful_life_years) return [];
    return computeDepreciationPlan({
      total_capitalised_value: capitalised,
      salvage_value: Number(form.salvage_value || 0),
      useful_life_years: Number(form.useful_life_years),
      depreciation_method: form.depreciation_method as DepreciationMethod,
      depreciation_rate: form.depreciation_rate ?? null,
      purchase_date: form.purchase_date,
    });
  }, [capitalised, form.salvage_value, form.useful_life_years, form.depreciation_method, form.depreciation_rate, form.purchase_date, form.purchase_value]);

  const firstYearDep = useMemo(
    () => previewPlan.slice(0, 12).reduce((s, p) => s + p.depreciationAmount, 0),
    [previewPlan],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.purchase_value <= 0 || !form.purchase_date) return;
    create.mutate(form, {
      onSuccess: (res) => navigate(`/assets/${res.asset.id}`),
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/assets"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">New Fixed Asset</h1>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Identity</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Asset name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Latitude 5450" required />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category_id || ''} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Make, model, configuration…" />
              </div>
              <div>
                <Label>Serial / VIN</Label>
                <Input value={form.serial_number || ''} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div>
                <Label>Location / Branch</Label>
                <Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Head Office, Warehouse A…" />
              </div>
              <div className="md:col-span-2">
                <Label>Custodian</Label>
                <Input value={form.custodian || ''} onChange={(e) => setForm({ ...form, custodian: e.target.value })} placeholder="Person responsible" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Purchase</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Purchase date *</Label>
                <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required />
              </div>
              <div>
                <Label>Vendor name</Label>
                <Input value={form.vendor_name || ''} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
              </div>
              <div>
                <Label>Purchase value (excl. GST) *</Label>
                <Input type="number" min={0} step="0.01" value={form.purchase_value || ''} onChange={(e) => setForm({ ...form, purchase_value: Number(e.target.value) })} required />
              </div>
              <div>
                <Label>GST amount</Label>
                <Input type="number" min={0} step="0.01" value={form.gst_amount || ''} onChange={(e) => setForm({ ...form, gst_amount: Number(e.target.value) })} />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label>GST split</Label>
                  <RadioGroup value={gstSplit} onValueChange={(v) => setGstSplit(v as 'intra' | 'inter')} className="flex gap-3">
                    <div className="flex items-center gap-1"><RadioGroupItem value="intra" id="intra" /><Label htmlFor="intra" className="text-sm font-normal">CGST + SGST</Label></div>
                    <div className="flex items-center gap-1"><RadioGroupItem value="inter" id="inter" /><Label htmlFor="inter" className="text-sm font-normal">IGST</Label></div>
                  </RadioGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.itc_eligible} onCheckedChange={(v) => setForm({ ...form, itc_eligible: v })} />
                  <Label className="text-sm">ITC eligible (GST is recoverable)</Label>
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>Payment mode</Label>
                <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">On credit (creates AP)</SelectItem>
                    <SelectItem value="bank">Paid via bank</SelectItem>
                    <SelectItem value="cash">Paid in cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Depreciation</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Method</Label>
                <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v as DepreciationMethod })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SLM">Straight Line (SLM)</SelectItem>
                    <SelectItem value="WDV">Written Down Value (WDV)</SelectItem>
                    <SelectItem value="None">No depreciation (e.g. Land)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Useful life (years)</Label>
                <Input type="number" min={0} step="0.5" value={form.useful_life_years || ''} onChange={(e) => setForm({ ...form, useful_life_years: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Salvage value</Label>
                <Input type="number" min={0} step="0.01" value={form.salvage_value || ''} onChange={(e) => setForm({ ...form, salvage_value: Number(e.target.value) })} />
              </div>
              {form.depreciation_method === 'WDV' && (
                <div className="md:col-span-3">
                  <Label>Annual depreciation rate (%)</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={form.depreciation_rate || ''} onChange={(e) => setForm({ ...form, depreciation_rate: Number(e.target.value) })} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Anything else for the audit trail." />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-orange-500" />Preview</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Capitalised value</span><span className="font-medium">{inr(capitalised)}</span></div>
              <Separator />
              <div className="flex justify-between"><span className="text-muted-foreground">Total periods</span><span>{previewPlan.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Year 1 depreciation</span><span>{inr(firstYearDep)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ending book value</span><span>{previewPlan.length > 0 ? inr(previewPlan[previewPlan.length - 1].closingBookValue) : inr(capitalised)}</span></div>
              <Separator />
              <div className="text-xs text-muted-foreground">
                Will post: <span className="font-medium">Dr Fixed Asset, Dr Input GST, Cr {form.payment_mode === 'credit' ? 'AP' : form.payment_mode === 'cash' ? 'Cash' : 'Bank'}</span>
              </div>
              <Button type="submit" disabled={create.isPending} className="w-full">
                {create.isPending ? 'Creating…' : 'Create asset & post journal'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
};

export default CreateAsset;
