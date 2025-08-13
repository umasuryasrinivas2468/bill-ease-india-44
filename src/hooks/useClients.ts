
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gst_number?: string;
  address?: string;
  created_at: string;
}

export const useClients = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      console.log('Fetching clients for user:', normalizedUserId);
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', normalizedUserId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching clients:', error);
        throw error;
      }
      
      console.log('Fetched clients:', data);
      return data as Client[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateClient = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (clientData: Omit<Client, 'id' | 'created_at'>) => {
      if (!user || !isValidUserId(user.id)) {
        console.error('User not authenticated or invalid user ID:', user?.id);
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      
      // Check for duplicate name
      const { data: existingByName } = await supabase
        .from('clients')
        .select('id, name')
        .eq('user_id', normalizedUserId)
        .ilike('name', clientData.name)
        .limit(1);
      
      if (existingByName && existingByName.length > 0) {
        throw new Error(`A client with the name "${clientData.name}" already exists.`);
      }
      
      // Check for duplicate GST number (if provided)
      if (clientData.gst_number && clientData.gst_number.trim()) {
        const { data: existingByGST } = await supabase
          .from('clients')
          .select('id, name, gst_number')
          .eq('user_id', normalizedUserId)
          .eq('gst_number', clientData.gst_number.trim())
          .limit(1);
        
        if (existingByGST && existingByGST.length > 0) {
          throw new Error(`A client with GST number "${clientData.gst_number}" already exists.`);
        }
      }
      
      console.log('Creating client for user:', normalizedUserId);
      console.log('Client data:', clientData);
      
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...clientData, user_id: normalizedUserId }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating client:', error);
        throw error;
      }
      
      console.log('Created client:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
};

export const useUpdateClient = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async ({ id, ...clientData }: Partial<Client> & { id: string }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      
      // Check for duplicate name (excluding current client)
      if (clientData.name) {
        const { data: existingByName } = await supabase
          .from('clients')
          .select('id, name')
          .eq('user_id', normalizedUserId)
          .ilike('name', clientData.name)
          .neq('id', id)
          .limit(1);
        
        if (existingByName && existingByName.length > 0) {
          throw new Error(`A client with the name "${clientData.name}" already exists.`);
        }
      }
      
      // Check for duplicate GST number (if provided and excluding current client)
      if (clientData.gst_number && clientData.gst_number.trim()) {
        const { data: existingByGST } = await supabase
          .from('clients')
          .select('id, name, gst_number')
          .eq('user_id', normalizedUserId)
          .eq('gst_number', clientData.gst_number.trim())
          .neq('id', id)
          .limit(1);
        
        if (existingByGST && existingByGST.length > 0) {
          throw new Error(`A client with GST number "${clientData.gst_number}" already exists.`);
        }
      }
      
      console.log('Updating client:', id, clientData);
      
      const { data, error } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', id)
        .eq('user_id', normalizedUserId)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating client:', error);
        throw error;
      }
      
      console.log('Updated client:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
};

export const useDeleteClient = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (clientId: string) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      console.log('Deleting client:', clientId);
      
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
        .eq('user_id', normalizedUserId);
      
      if (error) {
        console.error('Error deleting client:', error);
        throw error;
      }
      
      console.log('Deleted client:', clientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
};
