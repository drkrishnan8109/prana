export type UserRole = 'student' | 'host' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'banned';
export type HostTier = 'starter' | 'verified' | 'grove_master';
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type CourseStatus = 'draft' | 'live' | 'paused' | 'archived';
export type EnrollmentStatus = 'active' | 'completed' | 'refunded';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export interface HostProfile {
  id: string;
  user_id: string;
  bio?: string;
  tier: HostTier;
  total_students: number;
  avg_rating: number;
  commission_rate: number;
  stripe_account_id?: string;
  verified_at?: Date;
  created_at: Date;
}

export interface Course {
  id: string;
  host_id: string;
  title: string;
  description?: string;
  level: CourseLevel;
  price: number;
  duration_weeks?: number;
  emoji?: string;
  status: CourseStatus;
  avg_rating: number;
  total_students: number;
  created_at: Date;
  updated_at: Date;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  progress_pct: number;
  enrolled_at: Date;
  completed_at?: Date;
}

export interface Review {
  id: string;
  user_id: string;
  course_id: string;
  rating: number;
  body?: string;
  created_at: Date;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  price_monthly: number;
  features: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  stripe_subscription_id?: string;
  current_period_start?: Date;
  current_period_end?: Date;
  cancelled_at?: Date;
  created_at: Date;
}

export interface Payment {
  id: string;
  user_id: string;
  course_id?: string;
  subscription_id?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripe_payment_intent_id?: string;
  idempotency_key?: string;
  failure_reason?: string;
  created_at: Date;
}

export interface Payout {
  id: string;
  host_id: string;
  amount: number;
  commission_rate: number;
  platform_fee: number;
  status: PayoutStatus;
  stripe_payout_id?: string;
  period_start?: Date;
  period_end?: Date;
  created_at: Date;
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  updated_at: Date;
  updated_by?: string;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

// Express request augmentation
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        email: string;
      };
    }
  }
}
