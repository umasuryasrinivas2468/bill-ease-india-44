
import React, { useState, useEffect } from 'react';
import { Search, Grid, Package, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApps, App } from '@/hooks/useApps';
import { useUser } from '@clerk/clerk-react';

const Marketplace = () => {
  const { user } = useUser();
  const {
    apps,
    loading,
    installApp,
    uninstallApp,
    isAppInstalled,
    getInstalledApps,
    getCategories
  } = useApps();

  const [filteredApps, setFilteredApps] = useState<App[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Apps');

  const categories = getCategories();
  const installedApps = getInstalledApps();

  // Filter apps based on search and category
  useEffect(() => {
    let filtered = apps.filter(app => app.is_active);

    if (searchQuery) {
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== 'All Apps') {
      filtered = filtered.filter(app => app.category === selectedCategory);
    }

    setFilteredApps(filtered);
  }, [apps, searchQuery, selectedCategory]);

  const handleAppAction = async (appId: string, installed: boolean) => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    if (installed) {
      await uninstallApp(appId);
    } else {
      await installApp(appId);
    }
  };

  const handleOpenApp = (app: App) => {
    // For demo purposes, we'll open a placeholder URL
    // In a real app, each app would have its own URL or launch mechanism
    const appUrl = getAppUrl(app);
    window.open(appUrl, '_blank');
  };

  const getAppUrl = (app: App) => {
    // Demo URLs for different apps
    switch (app.name) {
      case 'QuickBooks Integration':
        return 'https://quickbooks.intuit.com/';
      case 'Aczen Inventory':
        return 'https://aczen.com/inventory';
      default:
        return '#';
    }
  };

  const AppCard = ({ app, showOpenButton = false }: { app: App; showOpenButton?: boolean }) => {
    const installed = isAppInstalled(app.id);

    return (
      <Card className="h-full hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                {app.icon_url ? (
                  <img src={app.icon_url} alt={app.name} className="w-8 h-8 rounded" />
                ) : (
                  <Package className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <CardTitle className="text-base">{app.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{app.developer}</p>
              </div>
            </div>
            <Badge variant="secondary" className="capitalize">{app.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="mb-4 line-clamp-2">
            {app.description}
          </CardDescription>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">v{app.version}</span>
            <div className="flex gap-2">
              {showOpenButton && installed && (
                <Button
                  onClick={() => handleOpenApp(app)}
                  variant="outline"
                  size="sm"
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open
                </Button>
              )}
              <Button
                onClick={() => handleAppAction(app.id, installed)}
                variant={installed ? "outline" : "default"}
                size="sm"
                disabled={!user}
              >
                {installed ? "Uninstall" : "Install"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to access the marketplace</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-muted/50 p-4 border-r">
        <h2 className="font-semibold mb-4">Categories</h2>
        <div className="space-y-2">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setSelectedCategory(category)}
            >
              {category === 'All Apps' ? (
                <Grid className="w-4 h-4 mr-2" />
              ) : (
                <Package className="w-4 h-4 mr-2" />
              )}
              <span className="capitalize">{category}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">App Marketplace</h1>
          <p className="text-muted-foreground">Discover and install apps to enhance your business</p>
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="available" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="available">
              Available Apps ({filteredApps.length})
            </TabsTrigger>
            <TabsTrigger value="installed">
              Installed Apps ({installedApps.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available">
            {filteredApps.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No apps found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search terms' : 'No apps available in this category'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredApps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="installed">
            {installedApps.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No installed apps</h3>
                <p className="text-muted-foreground">
                  Browse available apps to get started
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {installedApps.map((app) => (
                  <AppCard key={app.id} app={app} showOpenButton={true} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Marketplace;
