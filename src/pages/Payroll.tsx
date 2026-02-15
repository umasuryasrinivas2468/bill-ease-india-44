
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

const Payroll = () => {
  return (
    <div className="container mx-auto py-10 flex flex-col items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-blue-600">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 bg-white p-4 rounded-lg shadow-sm w-48 h-16 flex items-center justify-center">
             {/* Using a high quality Razorpay logo SVG from a stable source or building a text fallback if image fails, 
                but here I will use a direct image tag with a common CDN for Razorpay or similar. 
                Since I don't have internet access for external CDNs guaranteed to render in preview, I will use a text representation styled nicely 
                AND an image tag that might work if online. */}
             <img 
                src="https://upload.wikimedia.org/wikipedia/commons/8/89/Razorpay_logo.svg" 
                alt="Razorpay" 
                className="h-full w-full object-contain"
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerText = 'Razorpay';
                    e.currentTarget.parentElement!.style.color = '#3399cc';
                    e.currentTarget.parentElement!.style.fontWeight = 'bold';
                    e.currentTarget.parentElement!.style.fontSize = '1.5rem';
                }}
             />
          </div>
          <CardTitle className="text-2xl font-bold">Payroll Services</CardTitle>
          <CardDescription>
            Manage your payroll effortlessly with our partner
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
            <p className="text-center text-muted-foreground mb-4">
                We have partnered with Razorpay to provide you with seamless payroll solutions. 
                Click the button below to proceed to the payroll portal.
            </p>
          <Button 
            className="w-full bg-[#3399cc] hover:bg-[#2b82ad] text-white" 
            size="lg"
            asChild
          >
            <a href="https://rzp.io/rzp/N75lCBht" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
              Go to Payroll <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Payroll;
