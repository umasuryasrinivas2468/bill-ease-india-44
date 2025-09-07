import { useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SimpleBranding {
  id?: string;
  user_id: string;
  logo_url?: string;
  signature_url?: string;
  created_at?: string;
  updated_at?: string;
}

export const useSimpleBranding = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: branding, isLoading, error } = useQuery({
    queryKey: ['user-branding', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await (supabase as any)
        .from('user_branding')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    },
    enabled: !!user?.id,
  });

  const updateBrandingMutation = useMutation({
    mutationFn: async ({ logo_url, signature_url }: { logo_url?: string; signature_url?: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_branding' as any)
        .upsert({
          user_id: user.id,
          logo_url: logo_url || null,
          signature_url: signature_url || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ logo_url, signature_url }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['user-branding', user?.id] });

      // Snapshot the previous value
      const previousBranding = queryClient.getQueryData(['user-branding', user?.id]);

      // Optimistically update to the new value
      queryClient.setQueryData(['user-branding', user?.id], (old: any) => ({
        ...old,
        logo_url: logo_url || null,
        signature_url: signature_url || null,
      }));

      // Return a context object with the snapshotted value
      return { previousBranding };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousBranding) {
        queryClient.setQueryData(['user-branding', user?.id], context.previousBranding);
      }
      console.error('Branding update error:', err);
      toast({
        title: "Update Failed",
        description: "Failed to update branding assets. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // Always refetch after success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ['user-branding', user?.id] });
      toast({
        title: "Branding Updated",
        description: "Your branding assets have been saved successfully.",
      });
    },
  });

  const getBrandingWithFallback = () => {
    // Get from database first, then fall back to Clerk metadata
    const dbBranding = branding;
    const clerkMetadata = user?.unsafeMetadata as any;

    return {
      logo_url: dbBranding?.logo_url || clerkMetadata?.logoUrl || (clerkMetadata?.logoBase64 ? `data:image/png;base64,${clerkMetadata.logoBase64}` : ''),
      signature_url: dbBranding?.signature_url || clerkMetadata?.signatureUrl || (clerkMetadata?.signatureBase64 ? `data:image/png;base64,${clerkMetadata.signatureBase64}` : ''),
    };
  };

  return {
    branding,
    isLoading,
    error,
    updateBranding: updateBrandingMutation.mutate,
    isUpdating: updateBrandingMutation.isPending,
    getBrandingWithFallback,
  };
};

export default useSimpleBranding;