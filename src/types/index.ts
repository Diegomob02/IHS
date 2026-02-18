export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  property_id?: string;
  name: string;
  type: string;
  current_version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  property?: {
    title: string;
  };
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  change_log?: string;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: any;
  description?: string;
  category: string;
  updated_by?: string;
  updated_at: string;
}

export interface ReportPdfTemplate {
  id: string;
  name: string;
  report_key: string;
  enabled: boolean;
  priority: number;
  template_spec: any;
  match_rules: any;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: any;
  ip_address?: string;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  stripe_connected_account_id: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export type LeaseWeekendRule = 'shift_to_next_business_day' | 'shift_to_previous_business_day' | 'no_shift';
export type LeaseAutopayStatus = 'active' | 'pending_method' | 'failing' | 'paused';
export type LeaseStatus = 'active' | 'paused' | 'ended';

export interface Lease {
  id: string;
  property_id: string;
  tenant_id?: string | null;
  rent_amount_cents: number;
  currency: 'usd' | 'mxn';
  billing_day: number;
  weekend_rule: LeaseWeekendRule;
  autopay_enabled: boolean;
  autopay_status: LeaseAutopayStatus;
  autopay_retry_policy: any;
  status: LeaseStatus;
  created_at: string;
  updated_at: string;
}

export type TenantPaymentProfileStatus = 'active' | 'pending' | 'missing_method' | 'disabled';

export interface TenantPaymentProfile {
  id: string;
  tenant_id: string;
  client_id: string;
  stripe_customer_id?: string | null;
  default_payment_method_id?: string | null;
  payment_method_summary: any;
  status: TenantPaymentProfileStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentAttemptStatus = 'scheduled' | 'processing' | 'succeeded' | 'failed' | 'requires_action' | 'canceled';
export type PaymentAttemptInitiatedBy = 'system' | 'admin';

export interface PaymentAttempt {
  id: string;
  lease_id: string;
  property_id: string;
  client_id: string;
  period_yyyymm: string;
  attempt_no: number;
  amount_cents: number;
  currency: 'usd' | 'mxn';
  stripe_connected_account_id: string;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  status: PaymentAttemptStatus;
  failure_code?: string | null;
  failure_message_safe?: string | null;
  initiated_by: PaymentAttemptInitiatedBy;
  stripe_webhook_event_id?: string | null;
  created_at: string;
  updated_at: string;
}
