import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, Save, Settings, Users, FileText } from 'lucide-react';
import {
  fetchCSRPolicy, upsertCSRPolicy,
  CSRPolicy, CSRCommitteeMember,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';

const FOCUS_AREAS = [
  ['i',    '(i) Eradicating hunger, poverty & malnutrition'],
  ['ii',   '(ii) Promoting education'],
  ['iii',  '(iii) Gender equality & empowering women'],
  ['iv',   '(iv) Environmental sustainability'],
  ['v',    '(v) National heritage, art & culture'],
  ['vi',   '(vi) Benefit of armed forces veterans'],
  ['vii',  '(vii) Training to promote sports'],
  ['viii', '(viii) PM National Relief Fund / Schedule VII funds'],
  ['ix',   '(ix) Technology incubators'],
  ['x',    '(x) Rural development projects'],
  ['xi',   '(xi) Slum area development'],
  ['xii',  '(xii) Disaster management'],
];

const CSRSettings: React.FC = () => {
  const { user } = useUser();
  const [policy, setPolicy] = useState<CSRPolicy>({
    is_applicable: false,
    applicability_reason: '',
    committee_constituted: false,
    committee_members: [],
    policy_url: '',
    policy_adopted_on: '',
    focus_areas: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const p = await fetchCSRPolicy(user.id);
    if (p) setPolicy({ ...p, committee_members: p.committee_members ?? [], focus_areas: p.focus_areas ?? [] });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const addMember = () => {
    setPolicy(p => ({ ...p, committee_members: [...p.committee_members, { name: '', designation: '', role: '' }] }));
  };

  const updateMember = (i: number, field: keyof CSRCommitteeMember, value: string) => {
    setPolicy(p => ({
      ...p,
      committee_members: p.committee_members.map((m, idx) => idx === i ? { ...m, [field]: value } : m),
    }));
  };

  const removeMember = (i: number) => {
    setPolicy(p => ({ ...p, committee_members: p.committee_members.filter((_, idx) => idx !== i) }));
  };

  const toggleFocusArea = (item: string) => {
    setPolicy(p => ({
      ...p,
      focus_areas: p.focus_areas.includes(item)
        ? p.focus_areas.filter(x => x !== item)
        : [...p.focus_areas, item],
    }));
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await upsertCSRPolicy(user.id, policy);
      toast.success('CSR policy saved');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save policy');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading CSR policy…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" /> CSR Policy &amp; Committee
          </CardTitle>
          <CardDescription>Section 135 applicability + committee composition + Schedule VII focus areas</CardDescription>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Policy
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Applicability */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-3.5 w-3.5" />Applicability</h4>
          <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
            <Switch checked={policy.is_applicable}
                    onCheckedChange={(v) => setPolicy(p => ({ ...p, is_applicable: v }))} />
            <div>
              <Label className="text-sm">§135 applicable to this company</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Net Worth ≥ ₹500 Cr OR Turnover ≥ ₹1000 Cr OR Net Profit ≥ ₹5 Cr in preceding FY
              </p>
            </div>
          </div>
          {policy.is_applicable && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">Applicability trigger</Label>
              <Textarea id="reason" rows={2}
                placeholder="e.g. Net profit of ₹6.2 Cr in FY 2024-25 crossed §135(1) threshold"
                value={policy.applicability_reason ?? ''}
                onChange={(e) => setPolicy(p => ({ ...p, applicability_reason: e.target.value }))} />
            </div>
          )}
        </section>

        {/* Committee */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="h-3.5 w-3.5" />CSR Committee</h4>
            <Button size="sm" variant="outline" onClick={addMember}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Member
            </Button>
          </div>
          <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-3">
            <Switch checked={policy.committee_constituted}
                    onCheckedChange={(v) => setPolicy(p => ({ ...p, committee_constituted: v }))} />
            <Label className="text-sm">CSR Committee constituted per §135(1)</Label>
          </div>

          {policy.committee_members.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No committee members yet. Per §135(1), the committee must comprise at least 3 directors,
              including at least 1 independent director (or 2 directors for unlisted public &amp; private cos).
            </p>
          ) : (
            <div className="space-y-2">
              {policy.committee_members.map((m, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-md border p-2">
                  <Input className="md:col-span-4" placeholder="Name *" value={m.name}
                         onChange={(e) => updateMember(i, 'name', e.target.value)} />
                  <Input className="md:col-span-3" placeholder="Designation (Director / WTD / ID)"
                         value={m.designation} onChange={(e) => updateMember(i, 'designation', e.target.value)} />
                  <Input className="md:col-span-4" placeholder="Role (Chairman / Member)" value={m.role}
                         onChange={(e) => updateMember(i, 'role', e.target.value)} />
                  <Button className="md:col-span-1" size="sm" variant="ghost" onClick={() => removeMember(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Policy doc */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">CSR Policy Document</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pol-url">Policy URL (published per §135(4))</Label>
              <Input id="pol-url" placeholder="https://www.example.com/csr-policy.pdf"
                value={policy.policy_url ?? ''}
                onChange={(e) => setPolicy(p => ({ ...p, policy_url: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pol-date">Policy adopted on</Label>
              <Input id="pol-date" type="date"
                value={policy.policy_adopted_on ?? ''}
                onChange={(e) => setPolicy(p => ({ ...p, policy_adopted_on: e.target.value }))} />
            </div>
          </div>
        </section>

        {/* Focus areas */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Schedule VII Focus Areas</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FOCUS_AREAS.map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/30">
                <input type="checkbox"
                  checked={policy.focus_areas.includes(key)}
                  onChange={() => toggleFocusArea(key)}
                  className="mt-0.5" />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
          {policy.focus_areas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] uppercase text-muted-foreground self-center">Selected:</span>
              {policy.focus_areas.map(k => <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>)}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default CSRSettings;
