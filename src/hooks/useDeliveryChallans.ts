import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@clerk/clerk-react';
import { useToast } from '@/hooks/use-toast';

export interface DeliveryChallanItem {
  product_name: string;
  quantity: number;
  unit?: string;
  description?: string;
}

export interface DeliveryChallan {
  id: string;
  user_id: string;
  challan_number: string;
  challan_date: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gst_number?: string;
  items: DeliveryChallanItem[];
  delivery_status: 'pending' | 'in_transit' | 'delivered' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const useDeliveryChallans = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: challans = [], isLoading, error } = useQuery({
    queryKey: ['delivery-challans', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('delivery_challans')
        .select('*')
        .eq('user_id', user.id)
        .order('challan_date', { ascending: false });
      
      if (error) throw error;
      return (data || []).map(item => ({
        ...item,
        items: item.items as unknown as DeliveryChallanItem[]
      })) as DeliveryChallan[];
    },
    enabled: !!user?.id,
  });

  const createChallan = useMutation({
    mutationFn: async (challan: Omit<DeliveryChallan, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('delivery_challans')
        .insert([{ ...challan, user_id: user.id, items: challan.items as any }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      toast({ title: 'Success', description: 'Delivery challan created successfully!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error', 
        description: `Failed to create delivery challan: ${error.message}`,
        variant: 'destructive' 
      });
    },
  });

  const updateChallan = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DeliveryChallan> & { id: string }) => {
      const updateData: any = { ...updates };
      if (updates.items) {
        updateData.items = updates.items;
      }
      const { data, error } = await supabase
        .from('delivery_challans')
        .update(updateData as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      toast({ title: 'Success', description: 'Delivery challan updated successfully!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error', 
        description: `Failed to update delivery challan: ${error.message}`,
        variant: 'destructive' 
      });
    },
  });

  const deleteChallan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('delivery_challans')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-challans'] });
      toast({ title: 'Success', description: 'Delivery challan deleted successfully!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Error', 
        description: `Failed to delete delivery challan: ${error.message}`,
        variant: 'destructive' 
      });
    },
  });

  return {
    challans,
    isLoading,
    error,
    createChallan: createChallan.mutate,
    updateChallan: updateChallan.mutate,
    deleteChallan: deleteChallan.mutate,
    isCreating: createChallan.isPending,
    isUpdating: updateChallan.isPending,
    isDeleting: deleteChallan.isPending,
  };
};
