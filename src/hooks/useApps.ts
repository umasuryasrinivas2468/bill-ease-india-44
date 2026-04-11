
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
  const { user, isLoaded } = useUser();
  const { toast } = useToast();
  const [apps, setApps] = useState<App[]>([]);
  const [userApps, setUserApps] = useState<UserApp[]>([]);
  const [loading, setLoading] = useState(true);

  // Create demo apps if none exist
  const createDemoApp = async () => {
    try {
      const { data: existingApps, error: checkError } = await supabase
        .from('apps')
        .select('*');

      if (checkError) throw checkError;

      // Check if Aczen Inventory exists and needs updating
      const aczenApp = existingApps?.find(app => app.name === 'Aczen Inventory');
      
      if (aczenApp) {
        // Update existing Aczen Inventory app with new details
        const { error: updateError } = await supabase
          .from('apps')
          .update({
            description: 'An inventory logo serves as a visual representation of your business\'s core function: managing and tracking goods. A strong logo',
            icon_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTixbDnlVd-0O4xIMt7mS1LgZEbgMfIMm2wTg&s',
            category: 'inventory',
            developer: 'Aczen Solutions',
            version: '1.5.2'
          })
          .eq('id', aczenApp.id);

        if (updateError) throw updateError;
      } else if (!existingApps || existingApps.length === 0) {
        // Only create demo apps if no apps exist
        const demoApps = [
          {
            name: 'QuickBooks Integration',
            description: 'Seamlessly sync your invoices and financial data with QuickBooks. Automate your accounting workflow and keep your books up to date.',
            icon_url: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=100&h=100&fit=crop&crop=center',
            category: 'accounting',
            developer: 'FinTech Solutions',
            version: '2.1.0'
          },
          {
            name: 'Aczen Inventory',
            description: 'An inventory logo serves as a visual representation of your business\'s core function: managing and tracking goods. A strong logo',
            icon_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTixbDnlVd-0O4xIMt7mS1LgZEbgMfIMm2wTg&s',
            category: 'inventory',
            developer: 'Aczen Solutions',
            version: '1.5.2'
          }
        ];

        const { error: insertError } = await supabase
          .from('apps')
          .insert(demoApps);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('Error creating/updating demo apps:', error);
    }
  };

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
    if (!user || !isLoaded) return;

    try {
      console.log('Fetching user apps for user:', user.id);
      const { data, error } = await supabase
        .from('user_apps')
        .select('*')
        .eq('user_id', normalizeUserId(user.id))
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching user apps:', error);
        throw error;
      }
      
      console.log('User apps fetched:', data);
      setUserApps(data || []);
    } catch (error) {
      console.error('Error fetching user apps:', error);
    }
  };

  // Install an app
  const installApp = async (appId: string) => {
    if (!user || !isLoaded) {
      toast({
        title: "Error",
        description: "Please log in to install apps",
        variant: "destructive"
      });
      return false;
    }

    try {
      console.log('Installing app:', appId, 'for user:', user.id);
      
      const { error } = await supabase
        .from('user_apps')
        .insert({
          user_id: normalizeUserId(user.id),
          app_id: appId
        });

      if (error) {
        console.error('Error installing app:', error);
        throw error;
      }

      toast({
        title: "Success",
        description: "App installed successfully"
      });

      // Refresh user apps
      await fetchUserApps();
      return true;
    } catch (error) {
      console.error('Error installing app:', error);
      toast({
        title: "Error",
        description: "Failed to install app. Please try again.",
        variant: "destructive"
      });
      return false;
    }
  };

  // Uninstall an app
  const uninstallApp = async (appId: string) => {
    if (!user || !isLoaded) return false;

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

      // Refresh user apps
      await fetchUserApps();
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
      await createDemoApp();
      await fetchApps();
      if (user && isLoaded) {
        await fetchUserApps();
      }
      setLoading(false);
    };

    if (isLoaded) {
      initializeData();
    }
  }, [user, isLoaded]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!isLoaded) return;

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
        if (user && isLoaded) {
          fetchUserApps();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(appsChannel);
      supabase.removeChannel(userAppsChannel);
    };
  }, [user, isLoaded]);

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
      if (user && isLoaded) {
        await fetchUserApps();
      }
    }
  };
};
