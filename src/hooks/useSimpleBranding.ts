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

      // Also mirror to Clerk metadata as a resilient fallback for persistence
      try {
        await user.update({
          unsafeMetadata: {
            ...(user.unsafeMetadata as any),
            ...(logo_url !== undefined ? { logoUrl: logo_url || '' } : {}),
            ...(signature_url !== undefined ? { signatureUrl: signature_url || '' } : {}),
          },
        } as any);
      } catch (clerkErr) {
        // Non-fatal; persistence still exists in Supabase. Log for debugging.
        console.warn('Failed to mirror branding to Clerk metadata:', clerkErr);
      }

      return data;
    },
    onSuccess: (data) => {
      // Immediately update the cache with the new data
      queryClient.setQueryData(['user-branding', user?.id], data);
      
      toast({
        title: "Branding Updated",
        description: "Your branding assets have been saved successfully.",
      });
    },
    onError: (err) => {
      console.error('Branding update error:', err);
      toast({
        title: "Update Failed",
        description: "Failed to update branding assets. Please try again.",
        variant: "destructive",
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
    updateBranding: updateBrandingMutation.mutateAsync,
    isUpdating: updateBrandingMutation.isPending,
    getBrandingWithFallback,
  };
};

export default useSimpleBranding;