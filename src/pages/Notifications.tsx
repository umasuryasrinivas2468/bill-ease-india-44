
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Bell, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useInvoices, useUpdateInvoiceStatus, Invoice } from '@/hooks/useInvoices';
import { useToast } from '@/hooks/use-toast';

const Notifications = () => {
  const { data: invoices = [], isLoading } = useInvoices();
  const updateInvoiceStatus = useUpdateInvoiceStatus();
  const { toast } = useToast();

  const handleStatusChange = async (invoiceId: string, newStatus: 'paid' | 'pending' | 'overdue') => {
    try {
      await updateInvoiceStatus.mutateAsync({ invoiceId, status: newStatus });
      toast({
        title: "Status updated",
        description: `Invoice status has been changed to ${newStatus}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update invoice status. Please try again.",
        variant: "destructive",
      });
    }
  };

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'overdue':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">Loading your notifications...</p>
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
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Manage your invoice statuses and track payments</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="text-muted-foreground">No invoices to show notifications for.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {getStatusIcon(invoice.status)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{invoice.invoice_number}</h3>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Client: {invoice.client_name}
                      </p>
                      <p className="text-sm text-muted-foreground mb-1">
                        Amount: ₹{Number(invoice.total_amount).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground mb-1">
                        Invoice Date: {new Date(invoice.invoice_date).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Due Date: {new Date(invoice.due_date).toLocaleDateString()}
                      </p>
                      {invoice.status === 'overdue' && (
                        <p className="text-sm text-red-600 font-medium mt-2">
                          This invoice is overdue
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {invoice.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(invoice.id, 'paid')}
                        disabled={updateInvoiceStatus.isPending}
                        className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Mark Paid
                      </Button>
                    )}
                    {invoice.status !== 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(invoice.id, 'pending')}
                        disabled={updateInvoiceStatus.isPending}
                        className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Mark Pending
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
