import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import KYCVerification from '@/components/KYCVerification';

const BANKING_URL = 'https://onemoney-link.vercel.app/';

const Banking = () => {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-background">
      <div className="absolute left-4 top-4 z-20 md:hidden">
        <div className="rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </div>

      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <Button asChild variant="outline" className="bg-background/95 backdrop-blur">
          <a href={BANKING_URL} target="_blank" rel="noreferrer">
            Open in New Tab
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>

      {/* KYC Verification Banner - top of page */}
      <div className="absolute left-4 right-4 top-16 z-20 md:left-auto md:right-4 md:max-w-md">
        <KYCVerification compact className="bg-background/95 backdrop-blur-sm shadow-lg" />
      </div>

      {!iframeLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background text-sm text-muted-foreground">
          Loading banking webview...
        </div>
      )}

      <iframe
        src={BANKING_URL}
        title="OneMoney Banking Webview"
        className={`h-full w-full border-0 ${iframeLoaded ? 'visible' : 'invisible'}`}
        onLoad={() => setIframeLoaded(true)}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="fullscreen"
      />
    </div>
  );
};

export default Banking;
