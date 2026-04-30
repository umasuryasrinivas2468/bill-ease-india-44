import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// calculate-transaction-fees
// - Calculates fee breakdown for a transaction
// - Stores in transaction_fees table
// - Does NOT process actual payouts (that's done separately)
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { invoiceId, userId, totalAmount, feeStructureId, paymentId, orderId } = await req.json();

    if (!invoiceId || !userId || !totalAmount) {
      return jsonResp({ error: "invoiceId, userId, and totalAmount are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate fees using database function
    const { data: feeCalc, error: calcError } = await supabase.rpc("calculate_transaction_fees", {
      p_user_id: userId,
      p_total_amount: totalAmount,
      p_fee_structure_id: feeStructureId || null,
    });

    if (calcError) {
      console.error("[CalculateFees] Calculation error:", calcError);
      return jsonResp({ error: "Failed to calculate fees" }, 500);
    }

    if (feeCalc.error) {
      return jsonResp({ error: feeCalc.error }, 400);
    }

    // Store transaction fees
    const { data: transactionFee, error: insertError } = await supabase
      .from("transaction_fees")
      .insert({
        user_id: userId,
        invoice_id: invoiceId,
        payment_id: paymentId,
        order_id: orderId,
        total_amount: totalAmount,
        platform_fee: feeCalc.platform_fee,
        gateway_fee: feeCalc.gateway_fee,
        other_fees: feeCalc.other_fees,
        total_fees: feeCalc.total_fees,
        vendor_amount: feeCalc.vendor_amount,
        fee_structure_id: feeCalc.fee_structure_id,
        fee_breakdown: feeCalc.breakdown,
        status: "calculated",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[CalculateFees] Insert error:", insertError);
      return jsonResp({ error: "Failed to store transaction fees" }, 500);
    }

    // Update invoice
    await supabase
      .from("invoices")
      .update({
        transaction_fee_id: transactionFee.id,
        fees_calculated: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    console.log(`[CalculateFees] Calculated fees for invoice ${invoiceId}: Total fees ₹${feeCalc.total_fees}, Vendor gets ₹${feeCalc.vendor_amount}`);

    return jsonResp({
      success: true,
      transaction_fee_id: transactionFee.id,
      total_amount: totalAmount,
      fees: {
        platform: feeCalc.platform_fee,
        gateway: feeCalc.gateway_fee,
        other: feeCalc.other_fees,
        total: feeCalc.total_fees,
      },
      vendor_amount: feeCalc.vendor_amount,
      breakdown: feeCalc.breakdown,
    });
  } catch (err: any) {
    console.error("[CalculateFees] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
