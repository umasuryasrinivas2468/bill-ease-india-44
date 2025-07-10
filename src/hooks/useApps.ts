
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';

export interface App {
  id: string;
  name: string;
  description: string;
  icon_url: string;
  category: string;
  developer: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserApp {
  id: string;
  user_id: string;
  app_id: string;
  installed_at: string;
  is_active: boolean;
}

export const useApps = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [apps, setApps] = useState<App[]>([]);
  const [userApps, setUserApps] = useState<UserApp[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all available apps
  const fetchApps = async () => {
    try {
      const { data, error } = await supabase
        .from('apps')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApps(data || []);
    } catch (error) {
      console.error('Error fetching apps:', error);
      toast({
        title: "Error",
        description: "Failed to load apps",
        variant: "destructive"
      });
    }
  };

  // Fetch user's installed apps
  const fetchUserApps = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_apps')
        .select('*')
        .eq('user_id', normalizeUserId(user.id))
        .eq('is_active', true);

      if (error) throw error;
      setUserApps(data || []);
    } catch (error) {
      console.error('Error fetching user apps:', error);
    }
  };

  // Install an app
  const installApp = async (appId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_apps')
        .insert({
          user_id: normalizeUserId(user.id),
          app_id: appId
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "App installed successfully"
      });

      return true;
    } catch (error) {
      console.error('Error installing app:', error);
      toast({
        title: "Error",
        description: "Failed to install app",
        variant: "destructive"
      });
      return false;
    }
  };

  // Uninstall an app
  const uninstallApp = async (appId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('user_apps')
        .delete()
        .eq('user_id', normalizeUserId(user.id))
        .eq('app_id', appId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "App uninstalled successfully"
      });

      return true;
    } catch (error) {
      console.error('Error uninstalling app:', error);
      toast({
        title: "Error",
        description: "Failed to uninstall app",
        variant: "destructive"
      });
      return false;
    }
  };

  // Check if an app is installed
  const isAppInstalled = (appId: string) => {
    return userApps.some(userApp => userApp.app_id === appId);
  };

  // Get installed apps
  const getInstalledApps = () => {
    return apps.filter(app => isAppInstalled(app.id));
  };

  // Get available categories
  const getCategories = () => {
    const categories = ['All Apps'];
    const uniqueCategories = [...new Set(apps.map(app => app.category))];
    return categories.concat(uniqueCategories);
  };

  // Initial data fetch
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await fetchApps();
      if (user) {
        await fetchUserApps();
      }
      setLoading(false);
    };

    initializeData();
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    const appsChannel = supabase
      .channel('apps-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'apps'
      }, () => {
        fetchApps();
      })
      .subscribe();

    const userAppsChannel = supabase
      .channel('user-apps-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_apps'
      }, () => {
        if (user) {
          fetchUserApps();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appsChannel);
      supabase.removeChannel(userAppsChannel);
    };
  }, [user]);

  return {
    apps,
    userApps,
    loading,
    installApp,
    uninstallApp,
    isAppInstalled,
    getInstalledApps,
    getCategories,
    refetch: async () => {
      await fetchApps();
      if (user) {
        await fetchUserApps();
      }
    }
  };
};
