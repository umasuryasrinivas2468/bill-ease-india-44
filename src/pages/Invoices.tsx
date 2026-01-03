import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Search, Plus, Download, Eye, FileText, Trash2, Send, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInvoices, useDeleteInvoice, Invoice } from '@/hooks/useInvoices';
import InvoiceViewer from '@/components/InvoiceViewer';
import SendDocumentDialog from '@/components/SendDocumentDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import ImportDialog from '@/components/ImportDialog';
import { normalizeUserId } from '@/lib/userUtils';

const Invoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState<Invoice | null>(null);
  const { data: invoices = [], isLoading } = useInvoices();
  const deleteInvoice = useDeleteInvoice();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const handleSendInvoice = (invoice: Invoice) => {
    setInvoiceToSend(invoice);
    setIsSendDialogOpen(true);
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsViewerOpen(true);
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsViewerOpen(true);
    // The download will be handled inside the viewer component
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (window.confirm(`Are you sure you want to delete invoice ${invoice.invoice_number}?`)) {
      try {
        await deleteInvoice.mutateAsync(invoice.id);
        toast({
          title: "Invoice deleted",
          description: `Invoice ${invoice.invoice_number} has been deleted successfully.`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete invoice. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleImportInvoices = async (validRows: any[]) => {
    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const uid = normalizeUserId(user.id);

      const invoicesToInsert = validRows.map((row) => {
        const quantity = parseFloat(row.quantity || 1);
        const rate = parseFloat(row.rate || 0);
        const gstRate = parseFloat(row.gst_rate || 18);
        const amount = quantity * rate;
        const gstAmount = amount * (gstRate / 100);
        const totalAmount = amount + gstAmount;
        
        // Calculate due date if not provided (30 days from invoice date)
        const invoiceDate = row.invoice_date;
        const dueDate = row.due_date || new Date(new Date(invoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        return {
          user_id: uid,
          invoice_number: row.invoice_number,
          invoice_date: invoiceDate,
          due_date: dueDate,
          client_name: row.client_name,
          client_gst_number: row.client_gst_number || null,
          amount: amount,
          gst_amount: gstAmount,
          gst_rate: gstRate,
          total_amount: totalAmount,
          status: 'pending',
          notes: row.notes || null,
          items: [
            {
              description: row.item_description || '',
              hsn_sac: row.hsn_sac || '',
              quantity: quantity,
              rate: rate,
              amount: amount,
            }
          ],
        };
      });

      const { error } = await supabase.from('invoices').insert(invoicesToInsert);
      if (error) throw error;

      // Refetch invoices data - use both patterns to ensure cache is invalidated
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });

      setIsImportDialogOpen(false);
      toast({
        title: 'Import Successful',
        description: `${validRows.length} invoices imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import invoices. Please try again.',
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
            <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Loading your invoices...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <Card><CardContent className="h-20"></CardContent></Card>
          <Card><CardContent className="h-96"></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Manage your invoices and track payments</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button asChild variant="orange">
            <Link to="/create-invoice">
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Link>
          </Button>
        </div>
      </div>

      <ImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        moduleKey="invoices"
        onConfirmImport={handleImportInvoices}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
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
                variant={statusFilter === 'paid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('paid')}
              >
                Paid
              </Button>
              <Button
                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('pending')}
              >
                Pending
              </Button>
              <Button
                variant={statusFilter === 'overdue' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('overdue')}
              >
                Overdue
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Invoice Table */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'No invoices found matching your criteria.' 
                : 'No invoices created yet.'}
            </div>
            {!searchTerm && statusFilter === 'all' && (
              <Button asChild className="mt-4" variant="orange">
                <Link to="/create-invoice">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Invoice
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden sm:block">
            <CardContent className="p-0">
              <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>GST</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.client_name}</TableCell>
                        <TableCell>₹{Number(invoice.amount).toLocaleString()}</TableCell>
                        <TableCell>₹{Number(invoice.gst_amount).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">₹{Number(invoice.total_amount).toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell>{new Date(invoice.invoice_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleViewInvoice(invoice)}
                              className="transition-all hover:scale-105"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDownloadInvoice(invoice)}
                              className="transition-all hover:scale-105"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="default"
                              onClick={() => handleSendInvoice(invoice)}
                              className="transition-all hover:scale-105 bg-primary"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDeleteInvoice(invoice)}
                              disabled={deleteInvoice.isPending}
                              className="transition-all hover:scale-105"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>

          {/* Mobile Cards for smaller screens */}
          <div className="sm:hidden space-y-4">
            {filteredInvoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{invoice.invoice_number}</p>
                      <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
                    </div>
                    {getStatusBadge(invoice.status)}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Amount:</span>
                      <span>₹{Number(invoice.amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST:</span>
                      <span>₹{Number(invoice.gst_amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span>₹{Number(invoice.total_amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleViewInvoice(invoice)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleDownloadInvoice(invoice)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      className="flex-1 transition-all hover:scale-[1.02]"
                      onClick={() => handleSendInvoice(invoice)}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Send
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleDeleteInvoice(invoice)}
                      disabled={deleteInvoice.isPending}
                      className="transition-all hover:scale-[1.02]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <InvoiceViewer
        invoice={selectedInvoice}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setSelectedInvoice(null);
        }}
      />

      {invoiceToSend && (
        <SendDocumentDialog
          isOpen={isSendDialogOpen}
          onClose={() => {
            setIsSendDialogOpen(false);
            setInvoiceToSend(null);
          }}
          documentType="invoice"
          documentNumber={invoiceToSend.invoice_number}
          recipientName={invoiceToSend.client_name}
          recipientEmail={invoiceToSend.client_email || ''}
          amount={invoiceToSend.total_amount}
          dueDate={invoiceToSend.due_date}
        />
      )}
    </div>
  );
};

export default Invoices;
