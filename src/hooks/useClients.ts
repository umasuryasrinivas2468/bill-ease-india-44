
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
      console.log('Creating client for user:', normalizedUserId);
      console.log('Client data:', clientData);
      
      // Check for duplicate client by name and email
      const { data: existingClients, error: checkError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', normalizedUserId)
        .or(`name.eq.${clientData.name},email.eq.${clientData.email}`);
      
      if (checkError) {
        console.error('Error checking for existing clients:', checkError);
        throw checkError;
      }
      
      if (existingClients && existingClients.length > 0) {
        const duplicateByName = existingClients.find(c => c.name === clientData.name);
        const duplicateByEmail = existingClients.find(c => c.email === clientData.email && clientData.email);
        
        if (duplicateByName) {
          throw new Error(`A client with the name "${clientData.name}" already exists.`);
        }
        
        if (duplicateByEmail) {
          throw new Error(`A client with the email "${clientData.email}" already exists.`);
        }
      }
      
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
      console.log('Updating client:', id, clientData);
      
      // Check for duplicate client by name and email (excluding current client)
      if (clientData.name || clientData.email) {
        const { data: existingClients, error: checkError } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', normalizedUserId)
          .neq('id', id);
        
        if (checkError) {
          console.error('Error checking for existing clients:', checkError);
          throw checkError;
        }
        
        if (existingClients && existingClients.length > 0) {
          const duplicateByName = existingClients.find(c => c.name === clientData.name);
          const duplicateByEmail = existingClients.find(c => c.email === clientData.email && clientData.email);
          
          if (duplicateByName) {
            throw new Error(`A client with the name "${clientData.name}" already exists.`);
          }
          
          if (duplicateByEmail) {
            throw new Error(`A client with the email "${clientData.email}" already exists.`);
          }
        }
      }
      
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
