
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
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

  // Create demo apps - disabled since apps table doesn't exist
  const createDemoApp = async () => {
    // Apps functionality disabled - no apps table in database
    console.log('Apps table not available');
  };

  // Fetch all available apps - disabled since apps table doesn't exist
  const fetchApps = async () => {
    // Apps functionality disabled - no apps table in database
    setApps([]);
  };

  // Fetch user's installed apps - disabled since apps table doesn't exist
  const fetchUserApps = async () => {
    // Apps functionality disabled - no apps table in database
    setUserApps([]);
  };

  // Install an app - disabled since apps table doesn't exist
  const installApp = async (appId: string) => {
    toast({
      title: "Info",
      description: "Apps functionality is not available",
      variant: "destructive"
    });
    return false;
  };

  // Uninstall an app - disabled since apps table doesn't exist
  const uninstallApp = async (appId: string) => {
    toast({
      title: "Info",
      description: "Apps functionality is not available",
      variant: "destructive"
    });
    return false;
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

  // Real-time subscriptions disabled since apps table doesn't exist
  useEffect(() => {
    // Apps functionality disabled
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
