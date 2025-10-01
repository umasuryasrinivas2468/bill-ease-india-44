import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Check, DollarSign, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';

interface PurchaseOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  tax_rate: number;
  total: number;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  vendor_name: string;
  vendor_email?: string;
  order_date: string;
  due_date: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'received' | 'cancelled';
  payment_status: 'paid' | 'unpaid' | 'partial';
  items: PurchaseOrderItem[];
  notes?: string;
}

interface Vendor {
  id: string;
  vendor_name: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_address?: string;
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const paymentStatusColors = {
  paid: 'bg-green-100 text-green-800',
  unpaid: 'bg-red-100 text-red-800',
  partial: 'bg-orange-100 text-orange-800',
};

export default function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const { user } = useUser();
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    vendor_name: '',
    vendor_email: '',
    vendor_phone: '',
    vendor_address: '',
    order_date: new Date(),
    due_date: new Date(),
    notes: '',
  });
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([
    { id: '1', product_name: '', quantity: 1, price: 0, tax_rate: 18, total: 0 }
  ]);

  useEffect(() => {
    if (user) {
      fetchPurchaseOrders();
      fetchVendors();
    }
  }, [user]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter, paymentFilter]);

  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('purchase_orders' as any)
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data || []) as any);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch purchase orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user?.id)
        .order('name');

      if (error) throw error;
      setVendors((data || []).map((v: any) => ({ ...v, vendor_name: v.name })) as any);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.vendor_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    if (paymentFilter !== 'all') {
      filtered = filtered.filter((order) => order.payment_status === paymentFilter);
    }

    setFilteredOrders(filtered);
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `PO-${timestamp}`;
  };

  const calculateItemTotal = (item: PurchaseOrderItem) => {
    const subtotal = item.quantity * item.price;
    const taxAmount = (subtotal * item.tax_rate) / 100;
    return subtotal + taxAmount;
  };

  const calculateOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const taxAmount = orderItems.reduce((sum, item) => sum + ((item.quantity * item.price * item.tax_rate) / 100), 0);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleVendorSelect = (vendorName: string) => {
    const vendor = vendors.find(v => v.vendor_name === vendorName);
    if (vendor) {
      setFormData({
        ...formData,
        vendor_name: vendor.vendor_name,
        vendor_email: vendor.vendor_email || '',
        vendor_phone: vendor.vendor_phone || '',
        vendor_address: vendor.vendor_address || '',
      });
    }
  };

  const handleItemChange = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const updatedItems = [...orderItems];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'price' || field === 'tax_rate') {
      updatedItems[index].total = calculateItemTotal(updatedItems[index]);
    }
    
    setOrderItems(updatedItems);
  };

  const addItem = () => {
    setOrderItems([
      ...orderItems,
      { id: Date.now().toString(), product_name: '', quantity: 1, price: 0, tax_rate: 18, total: 0 }
    ]);
  };

  const removeItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setFormData({
      vendor_name: '',
      vendor_email: '',
      vendor_phone: '',
      vendor_address: '',
      order_date: new Date(),
      due_date: new Date(),
      notes: '',
    });
    setOrderItems([
      { id: '1', product_name: '', quantity: 1, price: 0, tax_rate: 18, total: 0 }
    ]);
    setEditingOrder(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { subtotal, taxAmount, total } = calculateOrderTotals();
      
      const orderData = {
        user_id: user?.id,
        order_number: editingOrder?.order_number || generateOrderNumber(),
        vendor_name: formData.vendor_name,
        vendor_email: formData.vendor_email,
        vendor_phone: formData.vendor_phone,
        vendor_address: formData.vendor_address,
        order_date: formData.order_date.toISOString().split('T')[0],
        due_date: formData.due_date.toISOString().split('T')[0],
        items: orderItems,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        status: editingOrder?.status || 'pending',
        payment_status: editingOrder?.payment_status || 'unpaid',
        notes: formData.notes,
      };

      let error;
      if (editingOrder) {
        ({ error } = await supabase
          .from('purchase_orders' as any)
          .update(orderData)
          .eq('id', editingOrder.id));
      } else {
        ({ error } = await supabase
          .from('purchase_orders' as any)
          .insert([orderData]));
      }

      if (error) throw error;

      toast({
        title: 'Success',
        description: editingOrder ? 'Purchase order updated successfully' : 'Purchase order created successfully',
      });

      setIsFormOpen(false);
      resetForm();
      fetchPurchaseOrders();
    } catch (error) {
      console.error('Error saving purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to save purchase order',
        variant: 'destructive',
      });
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('purchase_orders' as any)
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order status updated successfully',
      });

      fetchPurchaseOrders();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update order status',
        variant: 'destructive',
      });
    }
  };

  const markAsPaid = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('purchase_orders' as any)
        .update({ payment_status: 'paid' } as any)
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Order marked as paid',
      });

      fetchPurchaseOrders();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark as paid',
        variant: 'destructive',
      });
    }
  };

  const startEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setFormData({
      vendor_name: order.vendor_name,
      vendor_email: order.vendor_email || '',
      vendor_phone: '',
      vendor_address: '',
      order_date: new Date(order.order_date),
      due_date: new Date(order.due_date),
      notes: order.notes || '',
    });
    setOrderItems(order.items || []);
    setIsFormOpen(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Purchase Orders</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              New Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingOrder ? 'Edit Purchase Order' : 'New Purchase Order'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vendor_name">Vendor Name *</Label>
                  <Select value={formData.vendor_name} onValueChange={handleVendorSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select or type vendor name" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.vendor_name}>
                          {vendor.vendor_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-2"
                    placeholder="Or type new vendor name"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendor_email">Vendor Email</Label>
                  <Input
                    id="vendor_email"
                    type="email"
                    value={formData.vendor_email}
                    onChange={(e) => setFormData({ ...formData, vendor_email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="order_date">Order Date *</Label>
                  <DatePicker
                    date={formData.order_date}
                    setDate={(date) => setFormData({ ...formData, order_date: date || new Date() })}
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Due Date *</Label>
                  <DatePicker
                    date={formData.due_date}
                    setDate={(date) => setFormData({ ...formData, due_date: date || new Date() })}
                  />
                </div>
              </div>

              <div>
                <Label>Line Items</Label>
                <div className="space-y-2">
                  {orderItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center p-2 border rounded">
                      <div className="col-span-4">
                        <Input
                          placeholder="Product name"
                          value={item.product_name}
                          onChange={(e) => handleItemChange(index, 'product_name', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Price"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Tax %"
                          min="0"
                          max="100"
                          value={item.tax_rate}
                          onChange={(e) => handleItemChange(index, 'tax_rate', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        ₹{item.total.toFixed(2)}
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeItem(index)}
                          disabled={orderItems.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" onClick={addItem} variant="outline" className="mt-2">
                  Add Item
                </Button>
              </div>

              <div className="flex justify-end">
                <Card className="w-64">
                  <CardContent className="p-4">
                    {(() => {
                      const { subtotal, taxAmount, total } = calculateOrderTotals();
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tax:</span>
                            <span>₹{taxAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-bold border-t pt-2">
                            <span>Total:</span>
                            <span>₹{total.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingOrder ? 'Update' : 'Create'} Purchase Order
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Order No, Vendor"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payment-filter">Payment Status</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payment Status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order No</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.vendor_name}</div>
                      {order.vendor_email && (
                        <div className="text-sm text-muted-foreground">{order.vendor_email}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[order.status]}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={paymentStatusColors[order.payment_status]}>
                      {order.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(order.due_date).toLocaleDateString()}</TableCell>
                  <TableCell>₹{order.total_amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(order)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {order.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateOrderStatus(order.id, 'confirmed')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {order.payment_status !== 'paid' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsPaid(order.id)}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                      )}
                      {(order.status === 'pending' || order.status === 'confirmed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No purchase orders found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}