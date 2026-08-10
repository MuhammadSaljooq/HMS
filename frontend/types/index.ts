export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "cashier";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  mrn: string;
  full_name: string;
  date_of_birth: string;
  gender: string | null;
  phone: string | null;
  address: string | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
  last_visit?: string | null;
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  scheduled_at: string;
  status: AppointmentStatus;
  chief_complaint: string | null;
  notes: string | null;
  created_at: string;
}

export interface AppointmentListItem extends Appointment {
  patient_full_name: string;
  doctor_full_name: string;
}

export interface AppointmentDetail extends Appointment {
  doctor?: User | null;
  patient?: Patient | null;
}

export interface AppointmentSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  diagnosis: string | null;
  notes: string | null;
  created_at: string;
}

export interface Prescription {
  id: string;
  medical_record_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration_days: number | null;
  instructions: string | null;
}

export interface MedicalRecordDetail extends MedicalRecord {
  prescriptions: Prescription[];
  doctor?: User | null;
}

export type TranscriptionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "reviewed"
  | "approved";

export interface Transcription {
  id: string;
  medical_record_id: string | null;
  audio_file_url: string;
  raw_transcript: string | null;
  cleaned_transcript: string | null;
  language_detected: string | null;
  status: TranscriptionStatus;
  duration_seconds: number | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  edited?: boolean;
}

export interface TranscriptionListItem extends Transcription {
  patient_full_name?: string | null;
}

export interface TranscriptionSections {
  chief_complaint?: string | null;
  history?: string | null;
  examination?: string | null;
  assessment?: string | null;
  plan?: string | null;
}

export interface TranscriptionPipelineResult {
  transcription_id: string;
  raw_transcript: string | null;
  cleaned_transcript: string | null;
  language_detected: string | null;
  status: TranscriptionStatus;
  sections: TranscriptionSections;
}

export interface TranscriptionJobQueued {
  job_id: string;
  transcription_id: string;
  message?: string;
}

export interface TranscriptionJobStatus {
  job_id: string;
  celery_state: string;
  transcription_id: string | null;
  transcription_status: TranscriptionStatus | null;
  error: string | null;
}

export interface Vitals {
  id: string;
  patient_id: string;
  recorded_by: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  temperature_celsius: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  recorded_at: string;
}

export interface DashboardStats {
  total_patients: number;
  patients_registered_today: number;
  appointments_today: number;
  pending_transcriptions: number;
  active_doctors: number;
}

export interface PatientListResponse {
  items: Patient[];
  total: number;
}

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_wallet" | "other";
export type PaymentType = "payment" | "refund";

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  service_id: string | null;
  description: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  receipt_number: string;
  payment_type: PaymentType;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  received_by: string;
  received_at: string;
  notes: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string | null;
  patient_id: string;
  appointment_id: string | null;
  medical_record_id: string | null;
  status: InvoiceStatus;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  notes: string | null;
  created_by: string;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  line_items: InvoiceLineItem[];
  payments: Payment[];
}

export interface InvoiceListResponse {
  items: Invoice[];
  total: number;
}

export interface PatientLookupItem {
  id: string;
  full_name: string;
  mrn: string;
}

export interface MethodTotal {
  method: PaymentMethod;
  payments: string;
  refunds: string;
  net: string;
}

export interface DailyReport {
  date: string;
  totals: MethodTotal[];
  net_total: string;
}

export interface ReconciliationReport {
  date: string;
  cashier_id: string;
  totals: MethodTotal[];
  net_total: string;
}

export interface OutstandingItem {
  invoice_id: string;
  invoice_number: string | null;
  patient_id: string;
  patient_name: string;
  balance_due: string;
  status: InvoiceStatus;
}
