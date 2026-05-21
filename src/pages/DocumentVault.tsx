import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Plus, Archive, RotateCcw, AlertTriangle, Search, ExternalLink } from 'lucide-react';
import {
  useVaultDocuments,
  useCreateVaultDocument,
  useArchiveVaultDocument,
  useRestoreVaultDocument,
  useExpiringDocuments,
  useCrossModuleDocuments,
} from '@/hooks/useDocumentVault';
import type {
  CreateDocumentInput,
  DocumentType,
  DocumentEntityType,
} from '@/types/documentVault';

const DocumentVault: React.FC = () => {
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: docs = [] } = useVaultDocuments({
    documentType: docTypeFilter || undefined,
    includeArchived,
    search,
  });
  const { data: expiring = [] } = useExpiringDocuments();
  const { data: crossModule = [] } = useCrossModuleDocuments();
  const create = useCreateVaultDocument();
  const archive = useArchiveVaultDocument();
  const restore = useRestoreVaultDocument();

  const [draft, setDraft] = useState<CreateDocumentInput>({
    entity_type: 'generic',
    document_name: '',
    document_type: 'other',
    storage_url: '',
  });

  const submit = () => {
    if (!draft.document_name.trim() || !draft.storage_url.trim()) return;
    create.mutate(draft, {
      onSuccess: () => {
        setOpen(false);
        setDraft({
          entity_type: 'generic',
          document_name: '',
          document_type: 'other',
          storage_url: '',
        });
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" /> Document Vault
          </h1>
          <p className="text-sm text-muted-foreground">
            Centralised storage for invoices, warranties, insurance, agreements and loan documents.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> File document</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">In vault</div><div className="text-2xl font-bold">{docs.filter(d => !d.archived).length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Expiring (60d)</div><div className="text-2xl font-bold text-amber-600">{expiring.length}</div><div className="text-xs text-muted-foreground">{expiring.filter(e => e.is_expired).length} already expired</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Cross-module docs</div><div className="text-2xl font-bold">{crossModule.length}</div><div className="text-xs text-muted-foreground">Linked from other modules</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Archived</div><div className="text-2xl font-bold">{docs.filter(d => d.archived).length}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Search</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, title, description..."
                />
              </div>
            </div>
            <div className="w-[180px]">
              <Label>Document type</Label>
              <Select value={docTypeFilter || 'all'} onValueChange={(v) => setDocTypeFilter(v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="bill">Bill</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                  <SelectItem value="insurance_policy">Insurance policy</SelectItem>
                  <SelectItem value="agreement">Agreement</SelectItem>
                  <SelectItem value="loan_document">Loan document</SelectItem>
                  <SelectItem value="tax_filing">Tax filing</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="photograph">Photograph</SelectItem>
                  <SelectItem value="inspection_report">Inspection report</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                id="arch"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              <Label htmlFor="arch" className="font-normal">Include archived</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="vault">
        <TabsList>
          <TabsTrigger value="vault">Vault ({docs.length})</TabsTrigger>
          <TabsTrigger value="expiring">Expiring ({expiring.length})</TabsTrigger>
          <TabsTrigger value="cross">Cross-module ({crossModule.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vault" className="pt-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Linked to</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id} className={d.archived ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="font-medium">{d.document_name}</div>
                        {d.title && <div className="text-xs text-muted-foreground">{d.title}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {d.document_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize">{(d.entity_type || 'generic').replace('_', ' ')}</span>
                      </TableCell>
                      <TableCell className="text-xs">{d.doc_date || '—'}</TableCell>
                      <TableCell className="text-xs">{d.expiry_date || '—'}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(d.tags || []).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <a href={d.storage_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                        {d.archived ? (
                          <Button size="sm" variant="ghost" onClick={() => restore.mutate(d.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => archive.mutate(d.id)}><Archive className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {docs.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">No documents match this filter.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="pt-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiring.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.document_name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{d.document_type.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-xs">{d.expiry_date}</TableCell>
                      <TableCell>
                        {d.is_expired ? (
                          <Badge variant="destructive" className="text-[10px]">expired</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">in {d.days_until_expiry}d</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <a href={d.storage_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                  {expiring.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No documents expiring in 60 days.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cross" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents already attached to module records</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crossModule.map((c, i) => (
                    <TableRow key={`${c.source_table}-${c.entity_id}-${i}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {c.source_table.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{c.entity_label}</TableCell>
                      <TableCell className="text-xs">{c.doc_date || '—'}</TableCell>
                      <TableCell className="text-right">
                        <a href={c.document_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                  {crossModule.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-sm text-muted-foreground">No documents attached to module records.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>File a new document</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Document name</Label>
              <Input value={draft.document_name} onChange={(e) => setDraft({ ...draft, document_name: e.target.value })} placeholder="Lease agreement — 5th floor" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Document type</Label>
                <Select value={draft.document_type} onValueChange={(v) => setDraft({ ...draft, document_type: v as DocumentType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="bill">Bill</SelectItem>
                    <SelectItem value="warranty">Warranty</SelectItem>
                    <SelectItem value="insurance_policy">Insurance policy</SelectItem>
                    <SelectItem value="agreement">Agreement</SelectItem>
                    <SelectItem value="loan_document">Loan document</SelectItem>
                    <SelectItem value="tax_filing">Tax filing</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="photograph">Photograph</SelectItem>
                    <SelectItem value="inspection_report">Inspection report</SelectItem>
                    <SelectItem value="certificate">Certificate</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Linked entity type</Label>
                <Select value={String(draft.entity_type)} onValueChange={(v) => setDraft({ ...draft, entity_type: v as DocumentEntityType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">Generic / org-wide</SelectItem>
                    <SelectItem value="fixed_asset">Fixed asset</SelectItem>
                    <SelectItem value="liability">Liability</SelectItem>
                    <SelectItem value="lease_contract">Lease contract</SelectItem>
                    <SelectItem value="cwip_project">CWIP project</SelectItem>
                    <SelectItem value="maintenance_record">Maintenance record</SelectItem>
                    <SelectItem value="insurance_policy">Insurance policy</SelectItem>
                    <SelectItem value="insurance_claim">Insurance claim</SelectItem>
                    <SelectItem value="warranty">Warranty</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="allocation">Allocation</SelectItem>
                    <SelectItem value="audit_session">Audit session</SelectItem>
                    <SelectItem value="covenant">Covenant</SelectItem>
                    <SelectItem value="disposal_request">Disposal request</SelectItem>
                    <SelectItem value="revaluation">Revaluation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Linked entity ID (optional)</Label>
              <Input value={draft.entity_id || ''} onChange={(e) => setDraft({ ...draft, entity_id: e.target.value })} placeholder="UUID of the record" />
            </div>
            <div>
              <Label>Storage URL</Label>
              <Input value={draft.storage_url} onChange={(e) => setDraft({ ...draft, storage_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Doc date</Label>
                <Input type="date" value={draft.doc_date || ''} onChange={(e) => setDraft({ ...draft, doc_date: e.target.value })} />
              </div>
              <div>
                <Label>Expiry date</Label>
                <Input type="date" value={draft.expiry_date || ''} onChange={(e) => setDraft({ ...draft, expiry_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={(draft.tags || []).join(', ')}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="legal, FY26, signed"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Filing…' : 'File document'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentVault;
