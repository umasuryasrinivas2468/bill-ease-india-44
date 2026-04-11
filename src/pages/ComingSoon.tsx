import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock3 } from 'lucide-react';

const ComingSoon = () => {
  const [searchParams] = useSearchParams();
  const feature = searchParams.get('feature') || 'This feature';

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{feature}</h1>
          <p className="text-muted-foreground">This module is under implementation</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {feature} will be available soon. The navigation is ready and the module page is reserved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComingSoon;
