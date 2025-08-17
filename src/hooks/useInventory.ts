
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';

export interface InventoryItem {
  id: string;
  product_name: string;
  sku: string;
  category: string;
  type: string;
  purchase_price?: number;
  selling_price: number;
  stock_quantity: number;
  reorder_level: number;
  supplier_name?: string;
  supplier_contact?: string;
  supplier_email?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export const useInventory = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['inventory', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        console.log('No user ID available for inventory fetch');
        throw new Error('User not authenticated');
      }
      
      console.log('Fetching inventory for user:', user.id);
      
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching inventory:', error);
        throw error;
      }
      
      console.log('Fetched inventory data:', data);
      return data as InventoryItem[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
  });
};
