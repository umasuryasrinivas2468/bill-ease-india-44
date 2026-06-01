import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { fetchGstr2aDashboard } from '@/services/financialStatementsService';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const Gstr2a: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<string>(currentPeriod());

  const { data: dash } = useQuery({
    queryKey: ['gstr2a', userId, period],
    queryFn: () => userId ? fetchGstr2aDashboard(userId, period) : Promise.resolve(null),
    enabled: !!userId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error('Not signed in');
      const text = await file.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('File must be valid GSTR-2A JSON.'); }

      // Normalize the GSTN 2A JSON: top-level "b2b" array of suppliers, each
      // with "inv" array. Robust to either {b2b:[…]} or already-flattened.
      const suppliers: any[] = Array.isArray(parsed?.b2b) ? parsed.b2b
                            : Array.isArray(parsed?.suppliers) ? parsed.suppliers
                            : [];
      const periodFromFile = parsed?.fp
        ? `${parsed.fp.slice(2, 6)}-${parsed.fp.slice(0, 2)}`
        : period;

      let invoiceCount = 0, taxable = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
      const invoiceRows: any[] = [];
      for (const s of suppliers) {
        const ctin = s?.ctin ?? s?.gstin ?? s?.supplier_gstin ?? null;
        const name = s?.trade_name ?? s?.lgnm ?? s?.supplier_name ?? null;
        const invs = Array.isArray(s?.inv) ? s.inv : Array.isArray(s?.invoices) ? s.invoices : [];
        for (const inv of invs) {
          const items = Array.isArray(inv?.items) ? inv.items : Array.isArray(inv?.itms) ? inv.itms : [];
          let itv = 0, ig = 0, cg = 0, sg = 0, ce = 0;
          for (const it of items) {
            const d = it?.itm_det ?? it;
            itv += Number(d?.txval ?? d?.taxable_value ?? 0);
            ig  += Number(d?.iamt  ?? d?.igst ?? 0);
            cg  += Number(d?.camt  ?? d?.cgst ?? 0);
            sg  += Number(d?.samt  ?? d?.sgst ?? 0);
            ce  += Number(d?.csamt ?? d?.cess ?? 0);
          }
          if (!items.length) {
            itv = Number(inv?.txval ?? inv?.taxable_value ?? 0);
            ig  = Number(inv?.iamt  ?? inv?.igst ?? 0);
            cg  = Number(inv?.camt  ?? inv?.cgst ?? 0);
            sg  = Number(inv?.samt  ?? inv?.sgst ?? 0);
            ce  = Number(inv?.csamt ?? inv?.cess ?? 0);
          }
          invoiceCount += 1;
          taxable += itv; igst += ig; cgst += cg; sgst += sg; cess += ce;

          invoiceRows.push({
            user_id: userId,
            period: periodFromFile,
            supplier_gstin: ctin,
            supplier_name: name,
            invoice_number: inv?.inum ?? inv?.invoice_number ?? null,
            invoice_date: inv?.idt
              ? `${inv.idt.slice(6, 10)}-${inv.idt.slice(3, 5)}-${inv.idt.slice(0, 2)}`
              : inv?.invoice_date ?? null,
            invoice_value: Number(inv?.val ?? inv?.invoice_value ?? (itv + ig + cg + sg + ce)),
            taxable_value: itv, igst: ig, cgst: cg, sgst: sg, cess: ce,
            place_of_supply: inv?.pos ?? null,
            filing_status: s?.cfs ?? inv?.cfs ?? 'Pending',
            filing_date: null,
            invoice_type: inv?.inv_typ ?? null,
          });
        }
      }

      const { data: uploadRow, error: upErr } = await supabase
        .from('gstr2a_uploads')
        .insert({
          user_id: userId,
          period: periodFromFile,
          file_name: file.name,
          portal_invoice_count: invoiceCount,
          portal_taxable_value: taxable,
          portal_total_igst: igst,
          portal_total_cgst: cgst,
          portal_total_sgst: sgst,
          portal_total_cess: cess,
          raw_json: parsed,
        })
        .select('id, period')
        .single();
      if (upErr) throw upErr;

      const rowsWithUpload = invoiceRows.map(r => ({ ...r, upload_id: uploadRow.id }));
      if (rowsWithUpload.length) {
        const { error: invErr } = await supabase.from('gstr2a_invoices').insert(rowsWithUpload);
        if (invErr) throw invErr;
      }
      return { period: uploadRow.period, count: invoiceCount };
    },
    onSuccess: (r) => {
      toast.success(`Imported ${r.count} invoice(s) for ${r.period}`);
      setPeriod(r.period);
      queryClient.invalidateQueries({ queryKey: ['gstr2a'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Upload failed'),
  });

  const exportJson = () => {
    if (!dash) return;
    const blob = new Blob([JSON.stringify(dash, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GSTR2A_${period}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (!dash?.invoices?.length) return toast.message('No invoices to export.');
    const head = ['Supplier GSTIN', 'Supplier', 'Invoice #', 'Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice Value', 'Filing Status', 'Type'];
    const rows = dash.invoices.map(i => [
      i.supplier_gstin ?? '', i.supplier_name ?? '',
      i.invoice_number ?? '', i.invoice_date ?? '',
      i.taxable_value, i.igst, i.cgst, i.sgst, i.cess, i.invoice_value,
      i.filing_status ?? '', i.invoice_type ?? '',
    ]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GSTR2A_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const summary = dash?.summary;
  const filingPct = useMemo(() => {
    if (!summary) return null;
    const total = summary.filed_count + summary.pending_count;
    return total ? Math.round((summary.filed_count * 100) / total) : null;
  }, [summary]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">GSTR-2A</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Supplier purchase data from the GST portal. Upload the JSON downloaded from gst.gov.in to populate this view.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label>Period</Label>
            <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <label className="cursor-pointer">
            <Input type="file" accept=".json,application/json" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadMutation.mutate(f);
                e.target.value = '';
              }}
            />
            <Button asChild variant="default"><span><Upload className="h-4 w-4 mr-1" />Upload JSON</span></Button>
          </label>
          <Button variant="outline" onClick={exportJson}><FileJson className="h-4 w-4 mr-1" />JSON</Button>
          <Button variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-4 w-4 mr-1" />CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Invoices</div><div className="text-2xl font-bold mt-1">{summary?.invoice_count ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Taxable Value</div><div className="text-xl font-semibold mt-1">{fmtINR(summary?.taxable_value)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Total GST</div><div className="text-xl font-semibold mt-1">{fmtINR(summary?.total_gst)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Filed by Supplier</div><div className="text-2xl font-bold mt-1">{summary?.filed_count ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Pending Filing</div><div className="text-2xl font-bold mt-1 text-amber-600">{summary?.pending_count ?? 0}{filingPct != null && <span className="text-xs text-muted-foreground ml-2">({filingPct}% filed)</span>}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">By Supplier</TabsTrigger>
          <TabsTrigger value="invoices">All Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader><CardTitle>Suppliers in 2A</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Taxable Value</TableHead>
                      <TableHead className="text-right">Total GST</TableHead>
                      <TableHead className="text-right">Filed</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dash?.suppliers ?? []).map(s => (
                      <TableRow key={s.gstin + s.supplier}>
                        <TableCell className="font-mono text-xs">{s.gstin}</TableCell>
                        <TableCell>{s.supplier}</TableCell>
                        <TableCell className="text-right">{s.invoice_count}</TableCell>
                        <TableCell className="text-right">{fmtINR(s.taxable_value)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtINR(s.total_gst)}</TableCell>
                        <TableCell className="text-right">{s.filed_count}</TableCell>
                        <TableCell className="text-right">
                          {s.pending_count > 0
                            ? <Badge variant="destructive">{s.pending_count}</Badge>
                            : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!dash?.suppliers?.length && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No 2A data for {period}. Upload the JSON from the GST portal.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader><CardTitle>2A Invoices</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier GSTIN</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Filing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dash?.invoices ?? []).map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.supplier_gstin}</TableCell>
                        <TableCell>{i.supplier_name}</TableCell>
                        <TableCell>{i.invoice_number}</TableCell>
                        <TableCell>{i.invoice_date ?? '—'}</TableCell>
                        <TableCell className="text-right">{fmtINR(i.taxable_value)}</TableCell>
                        <TableCell className="text-right">{fmtINR(i.igst + i.cgst + i.sgst + i.cess)}</TableCell>
                        <TableCell className="text-right">{fmtINR(i.invoice_value)}</TableCell>
                        <TableCell>
                          <Badge variant={i.filing_status === 'Filed' ? 'default' : 'secondary'}>
                            {i.filing_status ?? 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!dash?.invoices?.length && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Gstr2a;
