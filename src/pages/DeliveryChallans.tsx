import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Download, Trash2, FileText, Truck, PackageCheck, PackageOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useDeliveryChallans } from '@/hooks/useDeliveryChallans';
import { DeliveryChallanForm } from '@/components/DeliveryChallanForm';
import { downloadDeliveryChallanPDF } from '@/utils/deliveryChallanPDF';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import { format } from 'date-fns';

const DeliveryChallans = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { challans, isLoading, createChallan, updateChallan, deleteChallan, isCreating } = useDeliveryChallans();
  const { getBusinessInfo } = useEnhancedBusinessData();
  const businessData = getBusinessInfo();

  const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    pending: { label: 'Open', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: PackageOpen },
    in_transit: { label: 'In Transit', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', icon: Truck },
    delivered: { label: 'Delivered', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: PackageCheck },
    cancelled: { label: 'Cancelled', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: Trash2 },
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return <Badge className={config.cls + ' gap-1'}><Icon className="h-3 w-3" /> {config.label}</Badge>;
  };

  const handleStatusChange = (challanId: string, newStatus: string) => {
    updateChallan({ id: challanId, delivery_status: newStatus as any });
  };

  const handleDownloadPDF = async (challan: any) => {
    await downloadDeliveryChallanPDF(challan, businessData);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this delivery challan?')) {
      deleteChallan(id);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Delivery Challans</h1>
            <p className="text-muted-foreground">Manage and track delivery challans</p>
          </div>
        </div>
        
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Challan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Total Challans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{challans.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {challans.filter(c => c.delivery_status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">In Transit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {challans.filter(c => c.delivery_status === 'in_transit').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {challans.filter(c => c.delivery_status === 'delivered').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Challans List */}
      {isLoading ? (
        <div className="text-center py-8">Loading delivery challans...</div>
      ) : challans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No delivery challans yet</h3>
            <p className="text-muted-foreground mb-4">Create your first delivery challan to get started</p>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Challan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {challans.map((challan) => (
            <Card key={challan.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{challan.challan_number}</CardTitle>
                    <CardDescription>
                      {challan.customer_name} | {format(new Date(challan.challan_date), 'PPP')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={challan.delivery_status}
                      onValueChange={(val) => handleStatusChange(challan.id, val)}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue>
                          {getStatusBadge(challan.delivery_status)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">
                          <span className="flex items-center gap-1.5"><PackageOpen className="h-3 w-3 text-amber-600" /> Open</span>
                        </SelectItem>
                        <SelectItem value="in_transit">
                          <span className="flex items-center gap-1.5"><Truck className="h-3 w-3 text-blue-600" /> In Transit</span>
                        </SelectItem>
                        <SelectItem value="delivered">
                          <span className="flex items-center gap-1.5"><PackageCheck className="h-3 w-3 text-green-600" /> Delivered</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPDF(challan)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(challan.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Items: </span>
                    {challan.items.length} item(s)
                  </div>
                  {challan.customer_phone && (
                    <div className="text-sm">
                      <span className="font-medium">Phone: </span>
                      {challan.customer_phone}
                    </div>
                  )}
                  {challan.customer_address && (
                    <div className="text-sm">
                      <span className="font-medium">Address: </span>
                      {challan.customer_address}
                    </div>
                  )}
                  {challan.notes && (
                    <div className="text-sm">
                      <span className="font-medium">Notes: </span>
                      {challan.notes}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DeliveryChallanForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSubmit={createChallan}
        isSubmitting={isCreating}
      />
    </div>
  );
};

export default DeliveryChallans;
