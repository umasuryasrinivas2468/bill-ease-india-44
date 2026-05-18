// ════════════════════════════════════════════════════════════════════════════
// Asset Disposal Service
//
// Handles full disposal / sale / write-off:
//   1) compute profit/loss = sale_proceeds - book_value
//   2) post the disposal journal:
//        Dr Bank / Cash                                (sale proceeds)
//        Dr Accumulated Depreciation                    (release accum)
//        Cr Fixed Asset                                 (gross capitalised value)
//        Cr Profit on Asset Sale  (Income)              if profit > 0
//        Dr Loss on Asset Sale    (Expense)             if loss  > 0
//   3) flip the asset to disposed/written_off, set disposed_at + amounts
//   4) cancel any remaining planned depreciation rows
//   5) write asset_transactions + audit_log
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type { FixedAsset } from '@/types/fixedAssets';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DisposalInput {
  asset_id: string;
  disposal_date: string;
  sale_proceeds: number;
  payment_mode?: 'bank' | 'cash';
  reason?: string;
  /** When true, no proceeds collected — full write-off. */
  write_off?: boolean;
  notes?: string;
}

export interface DisposalResult {
  asset: FixedAsset;
  journalId: string;
  profitLoss: number;
}

export const disposeFixedAsset = async (
  userId: string,
  input: DisposalInput,
): Promise<DisposalResult> => {
  const uid = normalizeUserId(userId);

  const { data: assetRow, error: aErr } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assetRow) throw new Error('Asset not found.');
  const asset = assetRow as FixedAsset;
  if (asset.status === 'disposed' || asset.status === 'written_off') {
    throw new Error('Asset is already disposed.');
  }
  if (!asset.asset_account_id || !asset.accum_dep_account_id) {
    throw new Error('Asset is missing linked COA accounts — cannot post disposal journal.');
  }

  const grossValue = round2(asset.total_capitalised_value);
  const accumDep = round2(asset.accumulated_depreciation);
  const bookValue = round2(grossValue - accumDep);
  const proceeds = input.write_off ? 0 : round2(input.sale_proceeds || 0);
  const profitLoss = round2(proceeds - bookValue);

  // Build the journal
  const lines: JournalLineInput[] = [];

  // Cash / Bank inflow (only when not a write-off)
  if (proceeds > 0) {
    const bankName = input.payment_mode === 'cash' ? 'Cash' : 'Bank';
    const bankAcc = await getOrCreateAccount(uid, bankName, 'Asset');
    lines.push({
      account_id: bankAcc,
      debit: proceeds,
      credit: 0,
      line_narration: `Sale proceeds for ${asset.name}`,
    });
  }

  // Release accumulated depreciation (Dr)
  if (accumDep > 0) {
    lines.push({
      account_id: asset.accum_dep_account_id,
      debit: accumDep,
      credit: 0,
      line_narration: `Reverse accumulated depreciation on ${asset.asset_code}`,
    });
  }

  // Remove the asset at gross value (Cr)
  lines.push({
    account_id: asset.asset_account_id,
    debit: 0,
    credit: grossValue,
    line_narration: `Reverse fixed asset ${asset.asset_code}`,
  });

  // Plug with Profit / Loss account
  if (profitLoss > 0) {
    const profitAcc = await getOrCreateAccount(uid, 'Profit on Asset Sale', 'Income');
    lines.push({
      account_id: profitAcc,
      debit: 0,
      credit: profitLoss,
      line_narration: 'Profit on asset disposal',
    });
  } else if (profitLoss < 0) {
    const lossAcc = await getOrCreateAccount(uid, 'Loss on Asset Sale', 'Expense');
    lines.push({
      account_id: lossAcc,
      debit: Math.abs(profitLoss),
      credit: 0,
      line_narration: 'Loss on asset disposal',
    });
  }

  const journalId = await postJournal({
    user_id: uid,
    date: input.disposal_date,
    narration: input.write_off
      ? `Asset write-off: ${asset.asset_code} — ${asset.name}`
      : `Asset disposal: ${asset.asset_code} — ${asset.name}`,
    source_type: input.write_off ? 'asset_write_off' : 'asset_disposal',
    source_id: asset.id,
    idempotency_key: `${input.write_off ? 'asset_write_off' : 'asset_disposal'}:${asset.id}`,
    lines,
  });

  // Update the asset row
  const newStatus = input.write_off ? 'written_off' : 'disposed';
  const { data: updated, error: uErr } = await supabase
    .from('fixed_assets')
    .update({
      status: newStatus,
      disposed_at: input.disposal_date,
      disposal_amount: proceeds,
      profit_loss_on_disposal: profitLoss,
      book_value: 0,
      notes: input.reason
        ? `${asset.notes ? asset.notes + '\n' : ''}Disposed: ${input.reason}`
        : asset.notes,
    })
    .eq('id', asset.id)
    .select('*')
    .single();
  if (uErr) throw uErr;

  // Cancel remaining planned depreciation
  await supabase
    .from('asset_depreciation_schedule')
    .update({ status: 'skipped', notes: 'Cancelled: asset disposed' })
    .eq('asset_id', asset.id)
    .eq('status', 'planned');

  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: asset.id,
    transaction_type: input.write_off ? 'write_off' : 'disposal',
    transaction_date: input.disposal_date,
    amount: proceeds,
    journal_id: journalId,
    notes: input.notes || input.reason || null,
    created_by: uid,
  });

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: asset.id,
    action: input.write_off ? 'write_off' : 'disposed',
    before_state: asset as unknown as Record<string, unknown>,
    after_state: updated as unknown as Record<string, unknown>,
    actor: uid,
  });

  return { asset: updated as FixedAsset, journalId, profitLoss };
};
