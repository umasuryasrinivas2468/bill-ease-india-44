import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════════════════
// process-payouts
// - Creates payout records for all recipients
// - Can process via Razorpay Payouts API or mark for manual processing
// - Tracks payout status
// ═══════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

function jsonResp(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createRazorpayPayout(
  recipientDetails: any,
  amount: number,
  reference: string
): Promise<{ success: boolean; payout_id?: string; error?: string }> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return { success: false, error: "Razorpay credentials not configured" };
  }

  try {
    const amountPaise = Math.round(amount * 100);

    const payoutData: any = {
      account_number: "your_razorpay_account_number", // Your Razorpay account
      amount: amountPaise,
      currency: "INR",
      mode: recipientDetails.upi_id ? "UPI" : "NEFT",
      purpose: "payout",
      fund_account: {
        account_type: recipientDetails.upi_id ? "vpa" : "bank_account",
        contact: {
          name: recipientDetails.recipient_name,
          email: recipientDetails.recipient_email,
          contact: recipientDetails.recipient_phone,
          type: "vendor",
        },
      },
      queue_if_low_balance: true,
      reference_id: reference,
      narration: `Payout for ${reference}`,
    };

    if (recipientDetails.upi_id) {
      payoutData.fund_account.vpa = {
        address: recipientDetails.upi_id,
      };
    } else {
      payoutData.fund_account.bank_account = {
        name: recipientDetails.bank_account_holder_name,
        ifsc: recipientDetails.bank_ifsc_code,
        account_number: recipientDetails.bank_account_number,
      };
    }

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const response = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payoutData),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.description || "Payout creation failed",
      };
    }

    return {
      success: true,
      payout_id: data.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Payout processing error",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      transactionFeeId,
      userId,
      payoutMethod = "manual", // 'razorpay_payout' or 'manual'
      recipientTypes, // Optional: ['platform', 'vendor', 'gateway'] - if not provided, pays all
    } = await req.json();

    if (!transactionFeeId || !userId) {
      return jsonResp({ error: "transactionFeeId and userId are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get transaction fees
    const { data: transactionFee, error: feeError } = await supabase
      .from("transaction_fees")
      .select("*")
      .eq("id", transactionFeeId)
      .eq("user_id", userId)
      .single();

    if (feeError || !transactionFee) {
      return jsonResp({ error: "Transaction fee record not found" }, 404);
    }

    // Get fee structure to find recipients
    const { data: feeStructure, error: structureError } = await supabase
      .from("fee_structures")
      .select("*, platform_recipient:fee_recipients!platform_recipient_id(*), gateway_recipient:fee_recipients!gateway_recipient_id(*)")
      .eq("id", transactionFee.fee_structure_id)
      .single();

    if (structureError) {
      return jsonResp({ error: "Fee structure not found" }, 404);
    }

    // Get vendor details
    const { data: invoice } = await supabase
      .from("invoices")
      .select("user_id, client_name")
      .eq("id", transactionFee.invoice_id)
      .single();

    const payouts: any[] = [];
    const errors: any[] = [];

    // Helper to create payout record
    const createPayoutRecord = async (
      recipientType: string,
      recipientId: string | null,
      recipientName: string,
      amount: number,
      recipientDetails: any
    ) => {
      if (amount <= 0) return;

      // Skip if recipientTypes filter is provided and this type is not included
      if (recipientTypes && !recipientTypes.includes(recipientType)) {
        return;
      }

      let externalPayoutId: string | undefined;
      let status = "pending";
      let errorMessage: string | undefined;

      // Process via Razorpay if requested and credentials available
      if (payoutMethod === "razorpay_payout" && recipientDetails) {
        const payoutResult = await createRazorpayPayout(
          recipientDetails,
          amount,
          `${transactionFee.invoice_id}-${recipientType}`
        );

        if (payoutResult.success) {
          externalPayoutId = payoutResult.payout_id;
          status = "processing";
        } else {
          status = "failed";
          errorMessage = payoutResult.error;
          errors.push({
            recipient_type: recipientType,
            error: payoutResult.error,
          });
        }
      }

      const { data: payout, error } = await supabase
        .from("payout_records")
        .insert({
          user_id: userId,
          transaction_fee_id: transactionFeeId,
          invoice_id: transactionFee.invoice_id,
          recipient_id: recipientId,
          recipient_type: recipientType,
          recipient_name: recipientName,
          payout_amount: amount,
          payout_method: payoutMethod,
          bank_account_number: recipientDetails?.bank_account_number,
          bank_ifsc_code: recipientDetails?.bank_ifsc_code,
          upi_id: recipientDetails?.upi_id,
          external_payout_id: externalPayoutId,
          status: status,
          error_message: errorMessage,
        })
        .select()
        .single();

      if (!error && payout) {
        payouts.push(payout);
      }
    };

    // Create payout for platform
    if (transactionFee.platform_fee > 0 && feeStructure.platform_recipient) {
      await createPayoutRecord(
        "platform",
        feeStructure.platform_recipient.id,
        feeStructure.platform_recipient.recipient_name,
        transactionFee.platform_fee,
        feeStructure.platform_recipient
      );
    }

    // Create payout for gateway
    if (transactionFee.gateway_fee > 0 && feeStructure.gateway_recipient) {
      await createPayoutRecord(
        "gateway",
        feeStructure.gateway_recipient.id,
        feeStructure.gateway_recipient.recipient_name,
        transactionFee.gateway_fee,
        feeStructure.gateway_recipient
      );
    }

    // Create payout for vendor (remaining amount)
    if (transactionFee.vendor_amount > 0) {
      // Get vendor recipient details
      const { data: vendorRecipient } = await supabase
        .from("fee_recipients")
        .select("*")
        .eq("user_id", invoice?.user_id || userId)
        .eq("recipient_type", "vendor")
        .eq("is_active", true)
        .maybeSingle();

      await createPayoutRecord(
        "vendor",
        vendorRecipient?.id || null,
        invoice?.client_name || "Vendor",
        transactionFee.vendor_amount,
        vendorRecipient
      );
    }

    // Update transaction fee status
    const allCompleted = payouts.every((p) => p.status === "completed");
    const anyFailed = payouts.some((p) => p.status === "failed");

    await supabase
      .from("transaction_fees")
      .update({
        status: allCompleted ? "completed" : anyFailed ? "failed" : "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionFeeId);

    // Update invoice if all payouts completed
    if (allCompleted) {
      await supabase
        .from("invoices")
        .update({
          payouts_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionFee.invoice_id);
    }

    console.log(`[ProcessPayouts] Created ${payouts.length} payout records for transaction ${transactionFeeId}`);

    return jsonResp({
      success: true,
      payouts_created: payouts.length,
      payouts: payouts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error("[ProcessPayouts] Unhandled:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
