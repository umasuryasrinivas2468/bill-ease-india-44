// TypeScript shapes for Employee Asset Allocation (Module 4).
// Mirrors 20260523000001_asset_allocations.sql.

export type AllocatedToType = 'employee' | 'team' | 'department';
export type AllocationCondition = 'new' | 'good' | 'fair' | 'damaged' | 'lost';
export type AllocationStatus = 'active' | 'returned' | 'lost' | 'damaged' | 'overdue';

export interface AssetAllocation {
  id: string;
  user_id: string;
  asset_id: string;
  allocated_to_type: AllocatedToType;
  employee_id?: string | null;
  employee_name: string;
  employee_email?: string | null;
  employee_phone?: string | null;
  team_name?: string | null;
  department?: string | null;
  designation?: string | null;
  issued_on: string;
  expected_return_on?: string | null;
  returned_on?: string | null;
  condition_on_issue: AllocationCondition;
  condition_on_return?: AllocationCondition | null;
  damage_notes?: string | null;
  damage_value?: number | null;
  status: AllocationStatus;
  acknowledgement_url?: string | null;
  return_document_url?: string | null;
  cost_center_id?: string | null;
  branch_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface EmployeeAllocationSummary {
  user_id: string;
  employee_key: string;
  employee_name: string;
  employee_email?: string | null;
  department?: string | null;
  active_allocations: number;
  lifetime_allocations: number;
  overdue_allocations: number;
  lifetime_damage_value: number;
}

export interface AssetAllocationSummary {
  user_id: string;
  asset_id: string;
  active_allocations: number;
  lifetime_allocations: number;
  damage_events: number;
  lifetime_damage_value: number;
}

export interface CreateAllocationInput {
  asset_id: string;
  allocated_to_type?: AllocatedToType;
  employee_id?: string;
  employee_name: string;
  employee_email?: string;
  employee_phone?: string;
  team_name?: string;
  department?: string;
  designation?: string;
  issued_on: string;
  expected_return_on?: string;
  condition_on_issue?: AllocationCondition;
  acknowledgement_url?: string;
  cost_center_id?: string;
  branch_id?: string;
  notes?: string;
}

export interface ReturnAllocationInput {
  allocation_id: string;
  returned_on: string;
  condition_on_return: AllocationCondition;
  damage_notes?: string;
  damage_value?: number;
  return_document_url?: string;
  notes?: string;
}

export interface OverdueAllocation extends AssetAllocation {
  asset_code?: string;
  asset_name?: string;
  days_overdue: number;
}
