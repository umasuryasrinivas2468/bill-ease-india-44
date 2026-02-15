import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Check, DollarSign, X, Eye, Download, Mail, PackageCheck, Clock } from 'lucide-react';
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

const OrderTimeline = ({ order }: { order: PurchaseOrder }) => {
  const steps = [
    { id: 'pending', label: 'Order Placed', date: order.order_date },
    { id: 'confirmed', label: 'Confirmed', date: null },
    { id: 'received', label: 'Received', date: order.status === 'received' ? (order as any).updated_at : null },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="py-4">
      <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
        {steps.map((step, index) => {
          const isCompleted = currentStepIndex >= index || (index === 0);
          const isCurrent = currentStepIndex === index;

          return (
            <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-emerald-500 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                {isCompleted ? <Check className="w-5 h-5" /> : <div className="w-3 h-3 bg-white rounded-full" />}
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 shadow bg-white">
                <div className="flex items-center justify-between space-x-2 mb-1">
                  <div className="font-bold text-slate-900">{step.label}</div>
                  <time className="font-caveat font-medium text-indigo-500">
                    {step.date ? new Date(step.date).toLocaleDateString() : (isCurrent && !isCancelled ? "In Progress" : "")}
                  </time>
                </div>
                <div className="text-slate-500 text-sm">
                  {isCurrent && !isCancelled ? (
                    "Current Status"
                  ) : isCancelled ? (
                    <span className="text-red-500 font-bold">Cancelled</span>
                  ) : isCompleted ? (
                    "Completed"
                  ) : (
                    "Pending"
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import OrderItemSelector from '@/components/OrderItemSelector';
import { InventoryItem } from '@/hooks/useInventory';
import { downloadOrderPDF, getOrderPDFBlob } from '@/utils/orderPDF';
import { useSimpleBranding } from '@/hooks/useSimpleBranding';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PurchaseOrderItem {
  id: string;
  product_id?: string;
  product_name: string;
  sku?: string;
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
  vendor_phone?: string;
  vendor_address?: string;
  order_date: string;
  due_date: string;
  total_amount: number;
  subtotal?: number;
  tax_amount?: number;
  status: 'pending' | 'confirmed' | 'received' | 'cancelled';
  payment_status: 'paid' | 'unpaid' | 'partial';
  items: PurchaseOrderItem[];
  notes?: string;
}

interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface BusinessProfile {
  business_name: string;
  owner_name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gst_number?: string;
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
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const { user } = useUser();
  const { toast } = useToast();
  const { getBrandingWithFallback } = useSimpleBranding();

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
      fetchBusinessProfile();
    }
  }, [user]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter, paymentFilter]);

  const fetchBusinessProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setBusinessProfile(data);
    } catch (error) {
      console.error('Error fetching business profile:', error);
    }
  };

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
      setVendors((data || []) as Vendor[]);
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

  const handleVendorSelect = (vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor) {
      setFormData({
        ...formData,
        vendor_name: vendor.name,
        vendor_email: vendor.email || '',
        vendor_phone: vendor.phone || '',
        vendor_address: vendor.address || '',
      });
    }
  };

  const handleInventoryItemSelect = (index: number, item: InventoryItem | null, productName: string) => {
    const updatedItems = [...orderItems];
    if (item) {
      updatedItems[index] = {
        ...updatedItems[index],
        product_id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        price: item.purchase_price || item.selling_price,
        tax_rate: 18,
        total: calculateItemTotal({ ...updatedItems[index], price: item.purchase_price || item.selling_price, quantity: updatedItems[index].quantity, tax_rate: 18 }),
      };
    } else {
      updatedItems[index] = {
        ...updatedItems[index],
        product_id: undefined,
        product_name: productName,
        sku: undefined,
      };
    }
    setOrderItems(updatedItems);
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

      if (status === 'received') {
        const order = orders.find(o => o.id === orderId);
        if (order && order.items) {
          for (const item of order.items) {
            if (item.product_id) {
              const { data: inventoryItem } = await supabase
                .from('inventory')
                .select('stock_quantity, type')
                .eq('id', item.product_id)
                .single();

              if (inventoryItem && inventoryItem.type === 'goods') {
                const newStock = (inventoryItem.stock_quantity || 0) + item.quantity;
                await supabase
                  .from('inventory')
                  .update({ stock_quantity: newStock })
                  .eq('id', item.product_id);
              }
            }
          }
        }
      }

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
      vendor_phone: order.vendor_phone || '',
      vendor_address: order.vendor_address || '',
      order_date: new Date(order.order_date),
      due_date: new Date(order.due_date),
      notes: order.notes || '',
    });
    setOrderItems(order.items || []);
    setIsFormOpen(true);
  };

  const handleDownloadPDF = async (order: PurchaseOrder) => {
    try {
      // Validate order data
      if (!order.items || order.items.length === 0) {
        throw new Error('Order has no items');
      }

      console.log('Generating PDF for order:', order.order_number);
      const branding = getBrandingWithFallback();
      await downloadOrderPDF(
        order,
        businessProfile || { business_name: 'Business Name', owner_name: '' },
        branding,
        'purchase'
      );
      toast({
        title: 'Success',
        description: 'PDF downloaded successfully',
      });
    } catch (error) {
      console.error('Error downloading PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to download PDF: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  };

  const handleEmailOrder = async (order: PurchaseOrder) => {
    try {
      // Validate order data
      if (!order.items || order.items.length === 0) {
        throw new Error('Order has no items');
      }

      console.log('Preparing email for order:', order.order_number);
      const branding = getBrandingWithFallback();
      const pdfBlob = await getOrderPDFBlob(
        order,
        businessProfile || { business_name: 'Business Name', owner_name: '' },
        branding,
        'purchase'
      );

      const subject = encodeURIComponent(`Purchase Order ${order.order_number} from ${businessProfile?.business_name || 'Our Company'}`);
      const body = encodeURIComponent(
        `Dear ${order.vendor_name},\n\n` +
        `Please find attached the Purchase Order ${order.order_number}.\n\n` +
        `Order Details:\n` +
        `- Order Number: ${order.order_number}\n` +
        `- Order Date: ${new Date(order.order_date).toLocaleDateString()}\n` +
        `- Due Date: ${new Date(order.due_date).toLocaleDateString()}\n` +
        `- Total Amount: ₹${order.total_amount.toFixed(2)}\n\n` +
        `Please confirm receipt and expected delivery date.\n\n` +
        `Best regards,\n${businessProfile?.owner_name || 'Your Company'}`
      );

      const mailtoLink = `mailto:${order.vendor_email || ''}?subject=${subject}&body=${body}`;
      window.open(mailtoLink, '_blank');

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO_${order.order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Email Draft Opened',
        description: 'PDF has been downloaded. Please attach it to your email.',
      });
    } catch (error) {
      console.error('Error preparing email:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: 'Error',
        description: `Failed to prepare email: ${errorMessage}`,
        variant: 'destructive',
      });
    }
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
                  <Label htmlFor="vendor_select">Select Vendor</Label>
                  <Select onValueChange={handleVendorSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select from vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="vendor_name">Vendor Name *</Label>
                  <Input
                    id="vendor_name"
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
                  <Label htmlFor="vendor_phone">Vendor Phone</Label>
                  <Input
                    id="vendor_phone"
                    value={formData.vendor_phone}
                    onChange={(e) => setFormData({ ...formData, vendor_phone: e.target.value })}
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
                        <OrderItemSelector
                          value={item.product_name}
                          onSelect={(inventoryItem, productName) => handleInventoryItemSelect(index, inventoryItem, productName)}
                          showStock={false}
                          placeholder="Select product"
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
                      <div className="col-span-1">
                        <Input
                          type="number"
                          placeholder="Tax %"
                          min="0"
                          max="100"
                          value={item.tax_rate}
                          onChange={(e) => handleItemChange(index, 'tax_rate', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="col-span-2 text-right">
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
                    <TooltipProvider>
                      <div className="flex space-x-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(order)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadPDF(order)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download PDF</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEmailOrder(order)}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Email Order</TooltipContent>
                        </Tooltip>

                        {order.status === 'pending' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'confirmed')}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Confirm</TooltipContent>
                          </Tooltip>
                        )}
                        {order.payment_status !== 'paid' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markAsPaid(order.id)}
                              >
                                <DollarSign className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Mark Paid</TooltipContent>
                          </Tooltip>
                        )}
                        {(order.status === 'pending' || order.status === 'confirmed') && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cancel</TooltipContent>
                          </Tooltip>
                        )}
                        {order.status === 'confirmed' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateOrderStatus(order.id, 'received')}
                              >
                                <PackageCheck className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Mark Received</TooltipContent>
                          </Tooltip>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Clock className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Order Timeline - {order.order_number}</DialogTitle>
                            </DialogHeader>
                            <OrderTimeline order={order} />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TooltipProvider>
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
