
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Edit, Trash2, Package, AlertTriangle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import { useVendors, Vendor } from '@/hooks/useVendors';

interface InventoryItem {
  id: string;
  product_name: string;
  sku: string;
  category: string;
  type: 'goods' | 'services';
  purchase_price?: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  supplier_name?: string;
  supplier_contact?: string;
  supplier_email?: string;
  vendor_ids?: string[];
  created_at: string;
}

const Inventory = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const { data: vendors } = useVendors();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [formData, setFormData] = useState({
    product_name: '',
    sku: '',
    category: '',
    type: 'goods' as 'goods' | 'services',
    purchase_price: '',
    selling_price: '',
    stock_quantity: '',
    reorder_level: '',
    supplier_name: '',
    supplier_contact: '',
    supplier_email: '',
    vendor_ids: [] as string[],
  });

  useEffect(() => {
    fetchInventory();
  }, [user]);

  const fetchInventory = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our interface
      const transformedData: InventoryItem[] = (data || []).map(item => ({
        ...item,
        type: item.type as 'goods' | 'services',
        // Ensure vendor_ids is treated as an array if it exists, otherwise empty
        vendor_ids: Array.isArray((item as any).vendor_ids) ? (item as any).vendor_ids : []
      }));

      setInventory(transformedData);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast({
        title: "Error",
        description: "Failed to fetch inventory items.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      product_name: '',
      sku: '',
      category: '',
      type: 'goods',
      purchase_price: '',
      selling_price: '',
      stock_quantity: '',
      reorder_level: '',
      supplier_name: '',
      supplier_contact: '',
      supplier_email: '',
      vendor_ids: [],
    });
    setEditingItem(null);
  };

  const handleEdit = (item: InventoryItem) => {
    setFormData({
      product_name: item.product_name,
      sku: item.sku,
      category: item.category,
      type: item.type,
      purchase_price: item.purchase_price?.toString() || '',
      selling_price: item.selling_price.toString(),
      stock_quantity: item.stock_quantity.toString(),
      reorder_level: item.reorder_level.toString(),
      supplier_name: item.supplier_name || '',
      supplier_contact: item.supplier_contact || '',
      supplier_email: item.supplier_email || '',
      vendor_ids: item.vendor_ids || [],
    });
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  // handleVendorSelect is replaced by inline logic in UI

  const handleSubmit = async () => {
    if (!user?.id) return;

    if (!formData.product_name || !formData.sku || !formData.category || !formData.selling_price) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const itemData = {
      user_id: user.id,
      product_name: formData.product_name,
      sku: formData.sku,
      category: formData.category,
      type: formData.type,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      selling_price: parseFloat(formData.selling_price),
      stock_quantity: formData.type === 'services' ? null : (parseInt(formData.stock_quantity) || 0),
      reorder_level: formData.type === 'services' ? null : (parseInt(formData.reorder_level) || 10),
      supplier_name: formData.supplier_name || null,
      supplier_contact: formData.supplier_contact || null,
      supplier_email: formData.supplier_email || null,
    };

    setIsLoading(true);
    try {
      if (editingItem) {
        const { error } = await supabase
          .from('inventory')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast({ title: "Success", description: "Item updated successfully!" });
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert([itemData]);

        if (error) throw error;
        toast({ title: "Success", description: "Item added successfully!" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchInventory();
    } catch (error: any) {
      console.error('Error saving item:', error);

      // Friendly handling for common DB constraint issues
      const errorCode = error?.code;
      const errorMessage: string = error?.message || '';
      const errorDetails: string = error?.details || '';

      // Unique constraint on (user_id, sku)
      if (
        errorCode === '23505' &&
        (errorMessage.includes('inventory_user_id_sku_key') ||
          errorDetails.includes('inventory_user_id_sku_key') ||
          errorDetails.includes('(user_id, sku)'))
      ) {
        toast({
          title: 'SKU already exists',
          description:
            'An inventory item with this SKU already exists. Please use a different SKU, or edit the existing item.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save item.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: "Success", description: "Item deleted successfully!" });
      fetchInventory();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: "Failed to delete item.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getLowStockItems = () => {
    return inventory.filter(item =>
      item.type === 'goods' &&
      item.stock_quantity !== null &&
      item.reorder_level !== null &&
      item.stock_quantity <= item.reorder_level
    );
  };

  const getTotalValue = () => {
    return inventory.reduce((sum, item) => {
      if (item.type === 'goods' && item.purchase_price && item.stock_quantity !== null) {
        return sum + (item.purchase_price * item.stock_quantity);
      }
      return sum;
    }, 0);
  };

  const lowStockItems = getLowStockItems();

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const uniqueCategories = Array.from(new Set(inventory.map(item => item.category)));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Manage your products and services</p>
          </div>
        </div>

        <Button onClick={() => {
          resetForm();
          setIsDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} modal={true}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
              <DialogDescription>Fill in the details for the inventory item</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  placeholder="Product or service name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="SKU-001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Electronics, Services, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: 'goods' | 'services') => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">Goods</SelectItem>
                    <SelectItem value="services">Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase_price">Purchase Price (₹)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling Price (₹) *</Label>
                <Input
                  id="selling_price"
                  type="number"
                  value={formData.selling_price}
                  onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>

              {formData.type === 'goods' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="stock_quantity">Stock Quantity</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                      placeholder="0"
                      min="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">Reorder Level</Label>
                    <Input
                      id="reorder_level"
                      type="number"
                      value={formData.reorder_level}
                      onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                      placeholder="10"
                      min="0"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Preferred Vendors (Priority Order)</Label>
                <div className="flex gap-2 mb-2">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !formData.vendor_ids.includes(value)) {
                        const newVendorIds = [...formData.vendor_ids, value];
                        setFormData({
                          ...formData,
                          vendor_ids: newVendorIds,
                          // Update supplier details from the primary (first) vendor if it's the first one added
                          ...(newVendorIds.length === 1 ? (() => {
                            const vendor = vendors?.find(v => v.id === value);
                            return vendor ? {
                              supplier_name: vendor.name,
                              supplier_contact: vendor.phone || '',
                              supplier_email: vendor.email || ''
                            } : {};
                          })() : {})
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add a vendor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors?.filter(v => !formData.vendor_ids.includes(v.id)).map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          <div className="flex items-center gap-2">
                            <span>{vendor.name}</span>
                            {vendor.tds_enabled && (
                              <Badge variant="outline" className="text-xs">TDS</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  {formData.vendor_ids.map((vendorId, index) => {
                    const vendor = vendors?.find(v => v.id === vendorId);
                    if (!vendor) return null;
                    return (
                      <div key={vendorId} className="flex items-center justify-between p-2 border rounded-md bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-white">{index + 1}</Badge>
                          <span>{vendor.name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newVendorIds = formData.vendor_ids.filter(id => id !== vendorId);
                            setFormData({ ...formData, vendor_ids: newVendorIds });
                          }}
                        >
                          <X className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                        </Button>
                      </div>
                    );
                  })}
                  {formData.vendor_ids.length === 0 && (
                    <div className="text-sm text-muted-foreground italic p-2 border border-dashed rounded-md text-center">
                      No vendors selected. Add vendors to establish priority.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name</Label>
                <Input
                  id="supplier_name"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  placeholder="Supplier company name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier_contact">Supplier Contact</Label>
                <Input
                  id="supplier_contact"
                  value={formData.supplier_contact}
                  onChange={(e) => setFormData({ ...formData, supplier_contact: e.target.value })}
                  placeholder="+91 9876543210"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="supplier_email">Supplier Email</Label>
                <Input
                  id="supplier_email"
                  type="email"
                  value={formData.supplier_email}
                  onChange={(e) => setFormData({ ...formData, supplier_email: e.target.value })}
                  placeholder="supplier@example.com"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Saving..." : editingItem ? "Update" : "Add"} Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{inventory.length}</div>
            <div className="text-xs text-blue-600 mt-1">
              {inventory.filter(i => i.type === 'goods').length} goods, {inventory.filter(i => i.type === 'services').length} services
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-800">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-900">{lowStockItems.length}</div>
            <div className="text-xs text-amber-600 mt-1">Items need reordering</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">Total Inventory Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-900">₹{getTotalValue().toFixed(2)}</div>
            <div className="text-xs text-emerald-600 mt-1">Based on purchase price</div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-800 flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-orange-200/50 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                      {item.stock_quantity}
                    </div>
                    <div>
                      <span className="font-medium text-sm block">{item.product_name}</span>
                      <span className="text-xs text-muted-foreground">SKU: {item.sku}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => handleEdit(item)}>
                    Restock
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory Filters & Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 border rounded-lg bg-slate-50">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading inventory...</p>
          </div>
        ) : filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No items found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No items match your search criteria" : "Add your first product or service to get started"}
              </p>
              {!searchQuery && (
                <Button onClick={() => {
                  resetForm();
                  setIsDialogOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Item
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-md bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Selling Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.product_name}
                      {item.type === 'goods' && item.stock_quantity <= item.reorder_level && (
                        <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-red-500" title="Low Stock"></span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <Badge variant={item.type === 'goods' ? 'default' : 'secondary'} className="text-xs">
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.type === 'services' ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <span className={item.stock_quantity <= item.reorder_level ? "text-red-600 font-bold" : ""}>
                          {item.stock_quantity}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{item.selling_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

    </div>
  );
};

export default Inventory;
