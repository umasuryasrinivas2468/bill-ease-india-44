
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

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
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Fetching clients for user:', user.id);
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching clients:', error);
        throw error;
      }
      
      console.log('Fetched clients:', data);
      return data as Client[];
    },
    enabled: !!user,
  });
};

export const useCreateClient = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (clientData: Omit<Client, 'id' | 'created_at'>) => {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Creating client:', clientData);
      
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...clientData, user_id: user.id }])
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
