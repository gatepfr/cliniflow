/**
 * Shared types consumed by multiple apps.
 * Keep this file lean — only add types that cross the api/worker/web boundary.
 */

/** Role values for User.role field */
export type UserRole = 'owner' | 'admin' | 'staff';

/** Conversation status values */
export type ConversationStatus = 'ai' | 'human' | 'closed';

/** Appointment status values */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** Message delivery status values */
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** Campaign status values */
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

/** Treatment status values */
export type TreatmentStatus = 'in_progress' | 'completed' | 'cancelled';

/** Plan tier values */
export type TenantPlan = 'starter' | 'pro' | 'multi';

/** Appointment source values */
export type AppointmentSource = 'ai' | 'manual' | 'integration';
