import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface Vendor {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  pan?: string;
  linked_tds_section_id?: string | null;
  tds_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export const useVendors = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['vendors', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('name');

      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateVendor = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vendorData: Partial<Vendor>) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }

      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('vendors')
        .insert([{ ...vendorData, user_id: normalizedUserId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: "Success",
        description: "Vendor created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vendor.",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateVendor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Vendor> }) => {
      const { data, error } = await supabase
        .from('vendors')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast({
        title: "Success",
        description: "Vendor updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vendor.",
        variant: "destructive",
      });
    },
  });
};
