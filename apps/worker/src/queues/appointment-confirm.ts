import type { Job } from 'bullmq';

export interface AppointmentConfirmJobData {
  appointmentId: string;
  patientId: string;
  tenantId: string;
  reminderType: '48h' | '3h';
}

/**
 * Sends appointment confirmation messages.
 * Phase 1: stub — full implementation in Phase 5.
 *
 * Job data contains only IDs — no PII (LGPD art. 11).
 */
export async function processAppointmentConfirm(
  job: Job<AppointmentConfirmJobData>,
): Promise<void> {
  job.log(
    `[appointment-confirm] Job ${job.id} received. Phase 5 will implement confirmation.`,
  );
}
