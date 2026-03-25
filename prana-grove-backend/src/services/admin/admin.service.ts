import { query, queryOne } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { User, Course, Payout, PlatformSetting, AuditLog } from '../../types';

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<{
  totalUsers: number;
  activeCourses: number;
  monthlyRevenue: number;
  avgRating: number;
  pendingPayouts: number;
  failedPayments: number;
}> {
  const [users] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM identity.users`
  );
  const [courses] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM learning.courses WHERE status = 'live'`
  );
  const [revenue] = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM billing.payments
     WHERE status = 'completed' AND created_at >= date_trunc('month', NOW())`
  );
  const [rating] = await query<{ avg: string }>(
    `SELECT ROUND(AVG(avg_rating)::numeric, 2) AS avg FROM learning.courses WHERE status = 'live'`
  );
  const [pendingPayouts] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM billing.payouts WHERE status = 'pending'`
  );
  const [failedPayments] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM billing.payments WHERE status = 'failed'`
  );

  return {
    totalUsers: parseInt(users.count),
    activeCourses: parseInt(courses.count),
    monthlyRevenue: parseFloat(revenue.total),
    avgRating: parseFloat(rating.avg) || 0,
    pendingPayouts: parseInt(pendingPayouts.count),
    failedPayments: parseInt(failedPayments.count),
  };
}

export async function getRevenueByMonth(months = 7): Promise<{ month: string; revenue: number }[]> {
  return query<{ month: string; revenue: number }>(
    `SELECT
       TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') AS month,
       ROUND(SUM(amount)::numeric, 2) AS revenue
     FROM billing.payments
     WHERE status = 'completed'
       AND created_at >= NOW() - INTERVAL '${months} months'
     GROUP BY date_trunc('month', created_at)
     ORDER BY date_trunc('month', created_at) ASC`
  );
}

export async function getUserRoleBreakdown(): Promise<{ role: string; count: number; pct: number }[]> {
  const rows = await query<{ role: string; count: string }>(
    `SELECT role, COUNT(*) AS count FROM identity.users GROUP BY role`
  );
  const total = rows.reduce((sum, r) => sum + parseInt(r.count), 0);
  return rows.map((r) => ({
    role: r.role,
    count: parseInt(r.count),
    pct: total > 0 ? parseFloat(((parseInt(r.count) / total) * 100).toFixed(1)) : 0,
  }));
}

// ─── User Management ─────────────────────────────────────────────────────────

export async function listUsers(search?: string): Promise<User[]> {
  if (search) {
    return query<User>(
      `SELECT id, email, full_name, role, status, created_at
       FROM identity.users
       WHERE full_name ILIKE $1 OR email ILIKE $1
       ORDER BY created_at DESC LIMIT 100`,
      [`%${search}%`]
    );
  }
  return query<User>(
    `SELECT id, email, full_name, role, status, created_at
     FROM identity.users ORDER BY created_at DESC LIMIT 100`
  );
}

export async function setUserStatus(
  adminId: string,
  userId: string,
  status: 'active' | 'inactive' | 'banned'
): Promise<User> {
  const [user] = await query<User>(
    `UPDATE identity.users SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, email, full_name, role, status, created_at, updated_at`,
    [status, userId]
  );
  if (!user) throw new AppError(404, 'User not found');
  await logAudit(adminId, `SET_USER_STATUS_${status.toUpperCase()}`, 'user', userId);
  return user;
}

// ─── Course Moderation ────────────────────────────────────────────────────────

export async function listAllCourses(): Promise<Course[]> {
  return query<Course>(
    `SELECT c.*, u.full_name AS host_name
     FROM learning.courses c
     LEFT JOIN identity.users u ON u.id = c.host_id
     ORDER BY c.created_at DESC`
  );
}

export async function setCourseStatus(
  adminId: string,
  courseId: string,
  status: 'live' | 'paused' | 'archived'
): Promise<Course> {
  const [course] = await query<Course>(
    `UPDATE learning.courses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, courseId]
  );
  if (!course) throw new AppError(404, 'Course not found');
  await logAudit(adminId, `SET_COURSE_STATUS_${status.toUpperCase()}`, 'course', courseId);
  return course;
}

// ─── Platform Settings ────────────────────────────────────────────────────────

export async function getSettings(): Promise<PlatformSetting[]> {
  return query<PlatformSetting>(`SELECT * FROM admin_schema.platform_settings ORDER BY key`);
}

export async function updateSetting(
  adminId: string,
  key: string,
  value: unknown
): Promise<PlatformSetting> {
  const [setting] = await query<PlatformSetting>(
    `INSERT INTO admin_schema.platform_settings (key, value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3
     RETURNING *`,
    [key, JSON.stringify(value), adminId]
  );
  await logAudit(adminId, 'UPDATE_SETTING', 'setting', adminId, { key, value });
  return setting;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function dispatchNotification(
  adminId: string,
  targetRole: string | null,
  subject: string,
  message: string
): Promise<{ dispatched: number }> {
  const users = targetRole
    ? await query<{ id: string; email: string }>(
        `SELECT id, email FROM identity.users WHERE role = $1 AND status = 'active'`,
        [targetRole]
      )
    : await query<{ id: string; email: string }>(
        `SELECT id, email FROM identity.users WHERE status = 'active'`
      );

  // In production: push to an email queue (e.g. SQS + SendGrid)
  // Here we log the dispatch intent
  console.log(`[Notifications] Dispatching "${subject}" to ${users.length} users`);

  await logAudit(adminId, 'DISPATCH_NOTIFICATION', 'platform', adminId, {
    subject,
    targetRole,
    recipientCount: users.length,
  });

  return { dispatched: users.length };
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function logAudit(
  adminId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO admin_schema.audit_log (admin_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null]
  );
}

export async function getAuditLog(limit = 50): Promise<AuditLog[]> {
  return query<AuditLog>(
    `SELECT a.*, u.full_name AS admin_name
     FROM admin_schema.audit_log a
     JOIN identity.users u ON u.id = a.admin_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
}
