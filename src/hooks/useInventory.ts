
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
  average_cost?: number;
  stock_value?: number;
  valuation_method?: 'average' | 'fifo';
  negative_stock_policy?: 'block' | 'warn' | 'allow';
  track_batch?: boolean;
  track_serial?: boolean;
  base_uom?: string;
  default_warehouse_id?: string | null;
  reorder_level: number;
  uom: string;
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
    staleTime: 15 * 1000,
    retry: 3,
  });
};

export interface InventoryMovement {
  id: string;
  item_id: string;
  movement_type: string;
  source_type: string;
  source_number?: string;
  party_name?: string;
  movement_date: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  value_in: number;
  value_out: number;
  cogs_amount: number;
  notes?: string;
}

export const useInventoryMovements = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['inventory-movements', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('inventory_movements' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data as InventoryMovement[];
    },
    enabled: !!user?.id,
    staleTime: 15 * 1000,
  });
};

export const useInventoryAlerts = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['inventory-alerts', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('inventory_alerts' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('is_resolved', false)
        .order('generated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 15 * 1000,
  });
};
