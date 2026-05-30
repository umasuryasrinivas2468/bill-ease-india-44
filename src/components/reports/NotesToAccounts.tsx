import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Edit, Loader2, RefreshCw, Save, X, BookOpen, Download } from 'lucide-react';
import { fetchNotesToAccounts, updateNoteOverride, AccountingNote, NotesToAccounts as Notes } from '@/services/financialStatementsService';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

interface Props {
  financialYear: string;
  companyName?: string;
}

const renderMarkdown = (md: string): string => {
  // Lightweight: bold + headings + paragraphs (kept inline-safe)
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-semibold mt-3 mb-1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n+/g, '</p><p class="my-2">')
    .replace(/^/, '<p class="my-2">')
    .concat('</p>');
};

const NotesToAccountsComponent: React.FC<Props> = ({ financialYear, companyName }) => {
  const { user } = useUser();
  const [data, setData] = useState<Notes | null>(null);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = async (regenerate = false) => {
    if (!user?.id) return;
    setLoading(true);
    const result = await fetchNotesToAccounts(user.id, financialYear, regenerate);
    setData(result);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, financialYear]);

  const startEdit = (note: AccountingNote) => {
    setEditId(note.id);
    setDraftBody(note.body);
  };

  const cancelEdit = () => {
    setEditId(null); setDraftBody('');
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      await updateNoteOverride(editId, draftBody);
      toast.success('Note updated');
      setEditId(null);
      await load();
    } catch {
      toast.error('Failed to save note');
    } finally { setSaving(false); }
  };

  const handlePDF = () => {
    if (!data) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('NOTES TO ACCOUNTS', w / 2, 15, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    if (companyName) doc.text(companyName, w / 2, 22, { align: 'center' });
    doc.text(`Fiscal Year ${financialYear}`, w / 2, 28, { align: 'center' });

    let y = 38;
    data.notes.forEach((n) => {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(`Note ${n.note_no}: ${n.title}`, 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const wrapped = doc.splitTextToSize((n.body || '').replace(/[#*]/g, ''), w - 28);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 4 + 4;
    });
    doc.save(`Notes_to_Accounts_${financialYear}.pdf`);
    toast.success('Notes PDF downloaded');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Notes to Accounts
          </CardTitle>
          <CardDescription>
            Auto-generated narrative notes per Schedule III · editable for CA review
          </CardDescription>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Regenerate</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handlePDF} disabled={!data || data.notes.length === 0}>
            <Download className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
          </div>
        ) : !data || data.notes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No notes generated yet. Click <strong>Regenerate</strong> to create defaults.
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-1.5">
            {data.notes.map((n) => (
              <AccordionItem key={n.id} value={n.id} className="border rounded-md px-3">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-left min-w-0">
                    <Badge variant="outline" className="font-mono text-[10px]">Note {n.note_no}</Badge>
                    <span className="font-medium text-sm truncate">{n.title}</span>
                    {n.is_overridden && <Badge variant="secondary" className="text-[10px]">Edited</Badge>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {editId === n.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={10}
                        className="font-mono text-xs"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                          Save override
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                          <X className="h-4 w-4 mr-1.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div
                        className="text-sm prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body || '') }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => startEdit(n)}>
                        <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit note
                      </Button>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default NotesToAccountsComponent;
