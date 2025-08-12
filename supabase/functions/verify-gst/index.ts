
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface GSTVerificationRequest {
  gstNumber: string;
}

interface GSTVerificationResponse {
  isValid: boolean;
  businessName?: string;
  address?: string;
  registrationDate?: string;
  status?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request body
    const body: GSTVerificationRequest = await req.json();
    const { gstNumber } = body;

    // Validate GST number format
    if (!gstNumber || typeof gstNumber !== 'string' || gstNumber.length !== 15) {
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          error: 'Invalid GST number format. Must be 15 characters.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get API key from environment variables
    const gstApiKey = Deno.env.get('GST_API_KEY');
    if (!gstApiKey) {
      console.error('GST API key not configured');
      return new Response(
        JSON.stringify({ 
          isValid: false, 
          error: 'GST verification service not available' 
        }),
        { 
          status: 503, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Call external GST verification API with rate limiting
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch('https://api.quickapi.in/v1/gstin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gstApiKey}`,
          'User-Agent': 'InvoiceApp/1.0'
        },
        body: JSON.stringify({ gstin: gstNumber }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`GST API error: ${response.status} ${response.statusText}`);
        return new Response(
          JSON.stringify({ 
            isValid: false, 
            error: 'GST verification service temporarily unavailable' 
          }),
          { 
            status: 503, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const data = await response.json();
      
      // Process and sanitize response
      const result: GSTVerificationResponse = {
        isValid: data.status === 'ACTIVE',
        businessName: data.lgnm || undefined,
        address: data.pradr?.addr ? 
          `${data.pradr.addr.bno || ''} ${data.pradr.addr.st || ''} ${data.pradr.addr.loc || ''} ${data.pradr.addr.dst || ''} ${data.pradr.addr.stcd || ''}`.trim() 
          : undefined,
        registrationDate: data.rgdt || undefined,
        status: data.status || undefined
      };

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('GST API request timeout');
        return new Response(
          JSON.stringify({ 
            isValid: false, 
            error: 'Request timeout. Please try again.' 
          }),
          { 
            status: 408, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('GST verification function error:', error);
    return new Response(
      JSON.stringify({ 
        isValid: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
