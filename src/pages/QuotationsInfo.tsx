
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Check, XCircle, PauseCircle, Plus, Eye, Download, Send, Upload } from 'lucide-react';
import { useQuotations, useUpdateQuotationStatus, Quotation } from '@/hooks/useQuotations';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import QuotationViewer from '@/components/QuotationViewer';
import SendDocumentDialog from '@/components/SendDocumentDialog';
import { useCSVExport } from '@/hooks/useCSVExport';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import ImportDialog from '@/components/ImportDialog';
import { normalizeUserId } from '@/lib/userUtils';

const statusColors: Record<Quotation['status'], string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  hold: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-muted text-foreground',
};

const QuotationsInfo: React.FC = () => {
  const { data: quotations = [], isLoading } = useQuotations();
  const updateStatus = useUpdateQuotationStatus();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { exportQuotations, isExporting } = useCSVExport();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Quotation['status']>('all');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [quotationToSend, setQuotationToSend] = useState<Quotation | null>(null);

  const handleSendQuotation = (quotation: Quotation) => {
    setQuotationToSend(quotation);
    setIsSendDialogOpen(true);
  };

  const filtered = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return quotations.filter(q => {
      const matchesSearch =
        q.client_name.toLowerCase().includes(s) ||
        q.quotation_number.toLowerCase().includes(s);
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotations, searchTerm, statusFilter]);

  const handleStatusChange = async (q: Quotation, next: Quotation['status']) => {
    if (q.status === next) return;
    try {
      await updateStatus.mutateAsync({ quotationId: q.id, status: next });
      toast({
        title: 'Status updated',
        description: `Quotation ${q.quotation_number} set to ${next}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update quotation status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const renderStatusBadge = (status: Quotation['status']) => (
    <Badge className={statusColors[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  );

  const handleViewQuotation = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setIsViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setSelectedQuotation(null);
  };

  const handleImportQuotations = async (validRows: any[]) => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const uid = normalizeUserId(user.id);

      const quotationsToInsert = validRows.map((row) => {
        const quantity = parseFloat(row.quantity || 1);
        const rate = parseFloat(row.rate || 0);
        const gstRate = parseFloat(row.gst_rate || 18);
        const subtotal = quantity * rate;
        const taxAmount = subtotal * (gstRate / 100);
        const totalAmount = subtotal + taxAmount;

        return {
          user_id: uid,
          quotation_number: row.quotation_number,
          quotation_date: row.quotation_date,
          client_name: row.client_name,
          client_email: row.client_email || null,
          client_phone: row.client_phone || null,
          client_address: row.client_address || null,
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          validity_period: 30,
          status: 'draft',
          terms_conditions: row.notes || null,
          items: [
            {
              name: row.item_description || '',
              description: row.hsn_sac || '',
              quantity: quantity,
              price: rate,
              amount: subtotal,
            }
          ],
        };
      });

      const { error } = await supabase.from('quotations').insert(quotationsToInsert);
      if (error) throw error;

      // Refetch quotations data - use both patterns to ensure cache is invalidated
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });

      setIsImportDialogOpen(false);
      toast({
        title: 'Import Successful',
        description: `${validRows.length} quotations imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import quotations. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quotations</h1>
            <p className="text-muted-foreground">Loading quotations...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <Card><CardContent className="h-20" /></Card>
          <Card><CardContent className="h-96" /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quotations</h1>
            <p className="text-muted-foreground">View and manage your quotations and their statuses</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => exportQuotations(filtered)}
            variant="outline"
            disabled={filtered.length === 0 || isExporting}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button 
            onClick={() => setIsImportDialogOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button 
            onClick={() => navigate('/quotations/create')}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Quotation
          </Button>
        </div>
      </div>

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        moduleKey="quotations"
        onConfirmImport={handleImportQuotations}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search quotations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'accepted' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('accepted')}
              >
                <Check className="h-4 w-4 mr-1" /> Accepted
              </Button>
              <Button
                variant={statusFilter === 'rejected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('rejected')}
              >
                <XCircle className="h-4 w-4 mr-1" /> Rejected
              </Button>
              <Button
                variant={statusFilter === 'hold' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('hold')}
              >
                <PauseCircle className="h-4 w-4 mr-1" /> Hold
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No quotations found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Change Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">{q.quotation_number}</TableCell>
                      <TableCell>{q.client_name}</TableCell>
                      <TableCell className="font-medium">₹{Number(q.total_amount).toLocaleString()}</TableCell>
                      <TableCell>{renderStatusBadge(q.status)}</TableCell>
                      <TableCell>{new Date(q.quotation_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewQuotation(q)}
                            className="flex items-center gap-1 transition-all hover:scale-105"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSendQuotation(q)}
                            className="flex items-center gap-1 transition-all hover:scale-105"
                          >
                            <Send className="h-3 w-3" />
                            Send
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <Select
                          value={q.status}
                          onValueChange={(val) => handleStatusChange(q, val as Quotation['status'])}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Set status" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-gray-200 shadow-lg z-50">
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="hold">Hold</SelectItem>
                            <SelectItem value="expired">Expired</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <QuotationViewer
        quotation={selectedQuotation}
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
      />

      {quotationToSend && (
        <SendDocumentDialog
          isOpen={isSendDialogOpen}
          onClose={() => {
            setIsSendDialogOpen(false);
            setQuotationToSend(null);
          }}
          documentType="quotation"
          documentNumber={quotationToSend.quotation_number}
          recipientName={quotationToSend.client_name}
          recipientEmail={quotationToSend.client_email || ''}
          recipientPhone={quotationToSend.client_phone || ''}
          amount={quotationToSend.total_amount}
        />
      )}
    </div>
  );
};

export default QuotationsInfo;
