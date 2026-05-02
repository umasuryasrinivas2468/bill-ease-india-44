import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// create-payment-link
// - Creates a Razorpay Payment Link for an invoice
// - Uses vendor's OAuth access token from payment_settings
// - Returns payment link URL that can be shared with customers
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_PARTNER_CLIENT_ID = Deno.env.get("RAZORPAY_PARTNER_CLIENT_ID")!;
const RAZORPAY_PARTNER_CLIENT_SECRET = Deno.env.get("RAZORPAY_PARTNER_CLIENT_SECRET")!;
const RAZORPAY_MODE = Deno.env.get("RAZORPAY_MODE") || "live";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshVendorToken(refreshToken: string) {
  const resp = await fetch("https://auth.razorpay.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: RAZORPAY_PARTNER_CLIENT_ID,
      client_secret: RAZORPAY_PARTNER_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      mode: RAZORPAY_MODE,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      invoiceId,
      userId,
      amount,
      description,
      vendor,
      customerName,
      customerEmail,
      customerPhone,
    } = await req.json();

    if (!userId) {
      return jsonResp({ error: "userId is required" }, 400);
    }

    const isStandaloneLink = !invoiceId;
    const directAmount = Number(amount || 0);
    if (isStandaloneLink && (!Number.isFinite(directAmount) || directAmount <= 0)) {
      return jsonResp({ error: "amount is required for direct payment links" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let invoice: any = null;
    if (invoiceId) {
      const { data: invoiceData, error: invErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, user_id, total_amount, client_name, client_email, client_phone, status, due_date")
        .eq("id", invoiceId)
        .eq("user_id", userId)
        .single();

      if (invErr || !invoiceData) {
        return jsonResp({ error: "Invoice not found" }, 404);
      }

      if (invoiceData.status === "paid") {
        return jsonResp({ error: "Invoice is already paid" }, 400);
      }

      invoice = invoiceData;
    }

    // Load vendor's payment settings
    const { data: settings, error: settingsErr } = await supabase
      .from("payment_settings")
      .select(
        "razorpay_account_id, razorpay_access_token, razorpay_refresh_token, razorpay_token_expires_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsErr || !settings?.razorpay_access_token) {
      return jsonResp(
        { error: "Online payments not activated. Please connect Razorpay in Settings → Payments." },
        400
      );
    }

    // Refresh token if expired
    let accessToken = settings.razorpay_access_token;
    const expiresAt = settings.razorpay_token_expires_at
      ? new Date(settings.razorpay_token_expires_at)
      : null;
    const tokenStale = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (tokenStale && settings.razorpay_refresh_token) {
      try {
        const refreshed = await refreshVendorToken(settings.razorpay_refresh_token);
        accessToken = refreshed.access_token;

        const newExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;

        await supabase
          .from("payment_settings")
          .update({
            razorpay_access_token: refreshed.access_token,
            razorpay_refresh_token: refreshed.refresh_token || settings.razorpay_refresh_token,
            razorpay_token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        console.log(`[PaymentLink] Refreshed token for user ${userId}`);
      } catch (err: any) {
        console.error("[PaymentLink] Token refresh failed:", err);
        return jsonResp(
          { error: "Payment authorization expired. Please reconnect Razorpay in Settings." },
          400
        );
      }
    }

    // Create Razorpay Payment Link
    let linkAmount = invoice ? Number(invoice.total_amount) : directAmount;
    
    const dueDate = invoice?.due_date ? new Date(invoice.due_date).getTime() / 1000 : undefined;
    const payerName = invoice
      ? customerName || invoice.client_name || "Customer"
      : vendor?.name || customerName || "Vendor";
    const payerEmail = invoice
      ? customerEmail || invoice.client_email || undefined
      : vendor?.email || customerEmail || undefined;
    const payerPhone = invoice
      ? customerPhone || invoice.client_phone || undefined
      : vendor?.phone || customerPhone || undefined;

    let linkDescription = invoice
      ? `Payment for Invoice ${invoice.invoice_number}`
      : description || `Payment request for ${payerName}`;

    // Apply fees for invoices
    if (invoice) {
      const baseAmount = linkAmount;
      const razorpayFeePercent = 2;
      const platformFeePercent = 1;
      
      const razorpayFee = baseAmount * (razorpayFeePercent / 100);
      const platformFee = baseAmount * (platformFeePercent / 100);
      
      linkAmount = baseAmount + razorpayFee + platformFee;
      
      linkDescription = `Invoice ${invoice.invoice_number} | Base: ₹${baseAmount.toFixed(2)} | Razorpay (2%): ₹${razorpayFee.toFixed(2)} | Aczen (1%): ₹${platformFee.toFixed(2)} | Total: ₹${linkAmount.toFixed(2)} (UPI options available)`;
    }

    const amountPaise = Math.round(linkAmount * 100);

    const paymentLinkPayload: any = {
      amount: amountPaise,
      currency: "INR",
      description: linkDescription,
      customer: {
        name: payerName,
        email: payerEmail,
        contact: payerPhone,
      },
      notify: {
        sms: !!payerPhone,
        email: !!payerEmail,
      },
      reminder_enable: true,
      notes: {
        invoice_id: invoiceId || "",
        invoice_number: invoice?.invoice_number || "",
        vendor_id: vendor?.id || "",
        source: invoice ? "aczen_invoice_payment_link" : "aczen_vendor_payment_link",
      },
      callback_url: invoice
        ? `${Deno.env.get("PUBLIC_APP_URL") || "https://app.aczen.in"}/invoices/${invoiceId}`
        : `${Deno.env.get("PUBLIC_APP_URL") || "https://app.aczen.in"}/payments`,
      callback_method: "get",
    };

    if (dueDate) {
      paymentLinkPayload.expire_by = Math.floor(dueDate);
    }

    const rzpResp = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentLinkPayload),
    });

    const rzpData = await rzpResp.json();
    if (!rzpResp.ok) {
      console.error(`[PaymentLink] API error (${rzpResp.status}):`, rzpData);

      const code = rzpData.error?.code || "";
      const desc = (rzpData.error?.description || "").toLowerCase();
      const scopeIssue =
        rzpResp.status === 401 ||
        rzpResp.status === 403 ||
        (code === "BAD_REQUEST_ERROR" && /scope|unauthor|insufficient|access/.test(desc));

      if (scopeIssue) {
        return jsonResp(
          {
            error: "Payment authorization missing permissions. Please reconnect Razorpay in Settings → Payments.",
            needs_reconnect: true,
          },
          400
        );
      }

      return jsonResp(
        { error: rzpData.error?.description || "Payment link creation failed" },
        400
      );
    }

    if (invoiceId) {
      await supabase
        .from("invoices")
        .update({
          payment_link: rzpData.short_url || rzpData.url,
          payment_link_id: rzpData.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
    }

    // Save to payment_links table
    await supabase.from("payment_links").insert({
      razorpay_link_id: rzpData.id,
      user_id: userId,
      vendor_id: vendor?.id || null,
      vendor_name: payerName,
      amount: linkAmount,
      amount_paid: 0,
      description: linkDescription,
      url: rzpData.short_url || rzpData.url,
      status: "created",
    });

    console.log(`[PaymentLink] Created payment link ${rzpData.id} for ${invoice ? `invoice ${invoice.invoice_number}` : `vendor ${payerName}`}`);

    return jsonResp({
      success: true,
      paymentLink: rzpData.short_url || rzpData.url,
      paymentLinkId: rzpData.id,
      amount: linkAmount,
      invoiceNumber: invoice?.invoice_number || null,
      vendorName: invoice ? null : payerName,
    });
  } catch (err: any) {
    console.error("[PaymentLink] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
