import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

// ═══════════════════════════════════════════════════════════════════
// razorpay-transfer-webhook
// - Handles transfer.processed, transfer.failed, transfer.reversed webhooks
// - Updates transfer_records table with latest status
// - Updates invoice transfer_status when all transfers complete
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return expectedSignature === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const body = await req.text();

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(body, signature, RAZORPAY_WEBHOOK_SECRET)) {
      console.error("[TransferWebhook] Invalid signature");
      return jsonResp({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(body);
    const event = payload.event;
    const transferData = payload.payload?.transfer?.entity;

    if (!transferData) {
      console.error("[TransferWebhook] No transfer data in payload");
      return jsonResp({ error: "Invalid payload" }, 400);
    }

    console.log(`[TransferWebhook] Received event: ${event} for transfer ${transferData.id}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update transfer record
    const updateData: any = {
      status: transferData.status,
      updated_at: new Date().toISOString(),
    };

    if (event === "transfer.processed") {
      updateData.processed_at = transferData.processed_at
        ? new Date(transferData.processed_at * 1000).toISOString()
        : new Date().toISOString();
      updateData.recipient_settlement_id = transferData.recipient_settlement_id;
    }

    if (event === "transfer.failed" && transferData.error) {
      updateData.error_details = {
        code: transferData.error.code,
        description: transferData.error.description,
        reason: transferData.error.reason,
      };
    }

    const { data: transfer, error: updateErr } = await supabase
      .from("transfer_records")
      .update(updateData)
      .eq("transfer_id", transferData.id)
      .select()
      .single();

    if (updateErr) {
      console.error("[TransferWebhook] Failed to update transfer:", updateErr);
      return jsonResp({ error: "Failed to update transfer" }, 500);
    }

    console.log(`[TransferWebhook] Updated transfer ${transferData.id} to status ${transferData.status}`);

    // Check if all transfers for the order are complete
    if (transfer.order_id) {
      const { data: allTransfers } = await supabase
        .from("transfer_records")
        .select("status")
        .eq("order_id", transfer.order_id);

      if (allTransfers) {
        const allProcessed = allTransfers.every(
          (t) => t.status === "processed" || t.status === "failed" || t.status === "reversed"
        );

        if (allProcessed) {
          const anyFailed = allTransfers.some((t) => t.status === "failed");
          const transferStatus = anyFailed ? "failed" : "completed";

          // Update invoice transfer status
          if (transfer.invoice_id) {
            await supabase
              .from("invoices")
              .update({
                transfer_status: transferStatus,
                updated_at: new Date().toISOString(),
              })
              .eq("id", transfer.invoice_id);

            console.log(
              `[TransferWebhook] Updated invoice ${transfer.invoice_id} transfer_status to ${transferStatus}`
            );
          }
        }
      }
    }

    return jsonResp({
      success: true,
      event,
      transfer_id: transferData.id,
      status: transferData.status,
    });
  } catch (err: any) {
    console.error("[TransferWebhook] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
