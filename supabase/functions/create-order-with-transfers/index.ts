import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// create-order-with-transfers
// - Creates a Razorpay Order with automatic fee transfers
// - Splits payment between vendor, platform, and third-parties
// - Uses fee configuration to calculate transfer amounts
// - Tracks all transfers in transfer_records table
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

function calculateTransferAmount(
  totalAmount: number,
  feeType: string,
  feeValue: number
): number {
  if (feeType === "percentage") {
    return Math.round((totalAmount * feeValue / 100) * 100); // Convert to paise
  } else if (feeType === "fixed") {
    return Math.round(feeValue * 100); // Convert to paise
  }
  return 0;
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
      feeConfigId,
      enableTransfers = true,
    } = await req.json();

    if (!invoiceId || !userId || !amount) {
      return jsonResp({ error: "invoiceId, userId, and amount are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, user_id, total_amount, status")
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .single();

    if (invErr || !invoice) {
      return jsonResp({ error: "Invoice not found" }, 404);
    }

    if (invoice.status === "paid") {
      return jsonResp({ error: "Invoice is already paid" }, 400);
    }

    // Load payment settings
    const { data: settings, error: settingsErr } = await supabase
      .from("payment_settings")
      .select(
        "razorpay_account_id, razorpay_access_token, razorpay_refresh_token, razorpay_public_token, razorpay_token_expires_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsErr || !settings?.razorpay_access_token) {
      return jsonResp(
        { error: "Online payments not activated. Please connect Razorpay in Settings." },
        400
      );
    }

    // Refresh token if expired
    let accessToken = settings.razorpay_access_token;
    let publicToken = settings.razorpay_public_token;
    const expiresAt = settings.razorpay_token_expires_at
      ? new Date(settings.razorpay_token_expires_at)
      : null;
    const tokenStale = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (tokenStale && settings.razorpay_refresh_token) {
      try {
        const refreshed = await refreshVendorToken(settings.razorpay_refresh_token);
        accessToken = refreshed.access_token;
        publicToken = refreshed.public_token || publicToken;

        const newExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
          : null;

        await supabase
          .from("payment_settings")
          .update({
            razorpay_access_token: refreshed.access_token,
            razorpay_refresh_token: refreshed.refresh_token || settings.razorpay_refresh_token,
            razorpay_public_token: publicToken,
            razorpay_token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        console.log(`[OrderWithTransfers] Refreshed token for user ${userId}`);
      } catch (err: any) {
        console.error("[OrderWithTransfers] Token refresh failed:", err);
        return jsonResp(
          { error: "Payment authorization expired. Please reconnect Razorpay." },
          400
        );
      }
    }

    const amountPaise = Math.round(Number(amount) * 100);
    const orderPayload: any = {
      amount: amountPaise,
      currency: "INR",
      notes: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        source: "aczen_bilz_with_transfers",
      },
    };

    // Load fee configuration and build transfers array
    const transfers: any[] = [];
    let feeConfig: any = null;

    if (enableTransfers) {
      // Load fee configuration
      if (feeConfigId) {
        const { data: config } = await supabase
          .from("fee_configurations")
          .select("*")
          .eq("id", feeConfigId)
          .eq("user_id", userId)
          .single();
        feeConfig = config;
      } else {
        // Load default configuration
        const { data: config } = await supabase
          .from("fee_configurations")
          .select("*")
          .eq("user_id", userId)
          .eq("is_default", true)
          .maybeSingle();
        feeConfig = config;
      }

      if (feeConfig) {
        let remainingAmount = amountPaise;

        // Platform fee
        if (feeConfig.platform_fee_type && feeConfig.platform_fee_type !== "none") {
          const platformFeeAmount = calculateTransferAmount(
            amount,
            feeConfig.platform_fee_type,
            feeConfig.platform_fee_value
          );

          if (platformFeeAmount > 0 && feeConfig.platform_account_id) {
            transfers.push({
              account: feeConfig.platform_account_id,
              amount: platformFeeAmount,
              currency: "INR",
              notes: {
                type: "platform_fee",
                fee_type: feeConfig.platform_fee_type,
                fee_value: feeConfig.platform_fee_value,
              },
              linked_account_notes: ["type"],
              on_hold: feeConfig.on_hold_default || false,
            });
            remainingAmount -= platformFeeAmount;
          }
        }

        // Third-party fees
        if (Array.isArray(feeConfig.third_party_fees)) {
          for (const thirdPartyFee of feeConfig.third_party_fees) {
            const thirdPartyAmount = calculateTransferAmount(
              amount,
              thirdPartyFee.fee_type,
              thirdPartyFee.fee_value
            );

            if (thirdPartyAmount > 0 && thirdPartyFee.account_id) {
              transfers.push({
                account: thirdPartyFee.account_id,
                amount: thirdPartyAmount,
                currency: "INR",
                notes: {
                  type: "third_party_fee",
                  name: thirdPartyFee.name || "Third Party",
                  fee_type: thirdPartyFee.fee_type,
                  fee_value: thirdPartyFee.fee_value,
                },
                linked_account_notes: ["type", "name"],
                on_hold: thirdPartyFee.on_hold || false,
              });
              remainingAmount -= thirdPartyAmount;
            }
          }
        }

        // Vendor amount (remaining after fees)
        if (remainingAmount > 0 && settings.razorpay_account_id) {
          transfers.push({
            account: settings.razorpay_account_id,
            amount: remainingAmount,
            currency: "INR",
            notes: {
              type: "vendor_payment",
              invoice_number: invoice.invoice_number,
            },
            linked_account_notes: ["type", "invoice_number"],
            on_hold: false,
          });
        }

        console.log(`[OrderWithTransfers] Created ${transfers.length} transfers for invoice ${invoice.invoice_number}`);
      }
    }

    // Add transfers to order payload if any
    if (transfers.length > 0) {
      orderPayload.transfers = transfers;
    }

    // Create Razorpay Order
    const rzpResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const rzpData = await rzpResp.json();
    if (!rzpResp.ok) {
      console.error(`[OrderWithTransfers] API error (${rzpResp.status}):`, rzpData);

      const code = rzpData.error?.code || "";
      const desc = (rzpData.error?.description || "").toLowerCase();
      const scopeIssue =
        rzpResp.status === 401 ||
        rzpResp.status === 403 ||
        (code === "BAD_REQUEST_ERROR" && /scope|unauthor|insufficient|access/.test(desc));

      if (scopeIssue) {
        return jsonResp(
          {
            error: "Payment authorization missing permissions. Please reconnect Razorpay.",
            needs_reconnect: true,
          },
          400
        );
      }

      return jsonResp(
        { error: rzpData.error?.description || "Order creation failed" },
        400
      );
    }

    // Store transfer records in database
    if (rzpData.transfers && Array.isArray(rzpData.transfers)) {
      for (const transfer of rzpData.transfers) {
        const recipientType = transfer.notes?.type === "platform_fee"
          ? "platform"
          : transfer.notes?.type === "third_party_fee"
          ? "third_party"
          : "vendor";

        await supabase.from("transfer_records").insert({
          user_id: userId,
          transfer_id: transfer.id,
          order_id: rzpData.id,
          recipient_account_id: transfer.recipient,
          recipient_type: recipientType,
          amount: transfer.amount,
          currency: transfer.currency,
          status: transfer.status,
          on_hold: transfer.on_hold,
          on_hold_until: transfer.on_hold_until,
          notes: transfer.notes || {},
          invoice_id: invoiceId,
        });
      }
    }

    // Update invoice with order details
    await supabase
      .from("invoices")
      .update({
        razorpay_order_id: rzpData.id,
        has_transfers: transfers.length > 0,
        transfer_status: transfers.length > 0 ? "pending" : null,
        fee_config_id: feeConfig?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    console.log(`[OrderWithTransfers] Created order ${rzpData.id} with ${transfers.length} transfers`);

    return jsonResp({
      success: true,
      order_id: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency,
      public_token: publicToken,
      transfers_count: transfers.length,
      transfers: rzpData.transfers || [],
    });
  } catch (err: any) {
    console.error("[OrderWithTransfers] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
