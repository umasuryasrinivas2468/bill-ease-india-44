
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Search, Plus, Download, Eye, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

const Invoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const invoices = [
    {
      id: "INV-001",
      clientName: "ABC Technologies",
      amount: 25000,
      gst: 4500,
      total: 29500,
      status: "paid",
      date: "2024-01-15",
      dueDate: "2024-02-15",
    },
    {
      id: "INV-002",
      clientName: "XYZ Solutions",
      amount: 18500,
      gst: 3330,
      total: 21830,
      status: "pending",
      date: "2024-01-14",
      dueDate: "2024-02-14",
    },
    {
      id: "INV-003",
      clientName: "Digital Corp",
      amount: 32000,
      gst: 5760,
      total: 37760,
      status: "paid",
      date: "2024-01-13",
      dueDate: "2024-02-13",
    },
    {
      id: "INV-004",
      clientName: "Tech Startup",
      amount: 15000,
      gst: 2700,
      total: 17700,
      status: "overdue",
      date: "2024-01-10",
      dueDate: "2024-02-10",
    },
  ];

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.id.toLowerCase().includes(searchTerm.toLowerCase());
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Invoices</h1>
            <p className="text-muted-foreground">Manage your invoices and track payments</p>
          </div>
        </div>
        <Button asChild>
          <Link to="/create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Link>
        </Button>
      </div>

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
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{invoice.clientName}</TableCell>
                    <TableCell>₹{invoice.amount.toLocaleString()}</TableCell>
                    <TableCell>₹{invoice.gst.toLocaleString()}</TableCell>
                    <TableCell className="font-medium">₹{invoice.total.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>{new Date(invoice.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Cards for smaller screens */}
      <div className="block sm:hidden space-y-4">
        {filteredInvoices.map((invoice) => (
          <Card key={invoice.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{invoice.id}</p>
                  <p className="text-sm text-muted-foreground">{invoice.clientName}</p>
                </div>
                {getStatusBadge(invoice.status)}
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span>₹{invoice.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST:</span>
                  <span>₹{invoice.gst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>₹{invoice.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{new Date(invoice.date).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" className="flex-1">
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <Button size="sm" variant="outline" className="flex-1">
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Invoices;
