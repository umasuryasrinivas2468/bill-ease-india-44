import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';

export interface ProjectUser {
  id: string;
  name: string;
  email: string;
}

export interface ProjectTask {
  id: string;
  name: string;
  description: string;
  billable: boolean;
}

export interface Project {
  id: string;
  user_id: string;
  project_name: string;
  project_code: string | null;
  client_id: string | null;
  client_name: string | null;
  billing_method: string;
  description: string | null;
  assigned_users: ProjectUser[];
  tasks: ProjectTask[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectPayload {
  project_name: string;
  project_code?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  billing_method: string;
  description?: string | null;
  assigned_users?: ProjectUser[];
  tasks?: ProjectTask[];
  is_active?: boolean;
}

const PROJECTS_QUERY_KEY = ['projects'];

export const useProjects = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: [...PROJECTS_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as Project[];
    },
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async (payload: ProjectPayload) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...payload,
          user_id: user.id,
          assigned_users: payload.assigned_users || [],
          tasks: payload.tasks || [],
          project_code: payload.project_code || null,
          client_id: payload.client_id || null,
          client_name: payload.client_name || null,
          description: payload.description || null,
          is_active: payload.is_active ?? true,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<ProjectPayload> & { id: string }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('projects')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
  });
};
