import { query, queryOne } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { Course, Enrollment, Review, CourseLevel, CourseStatus } from '../../types';
import * as identitySvc from '../identity/identity.service';

// ─── Courses ──────────────────────────────────────────────────────────────────

export async function listCourses(filters: {
  level?: CourseLevel;
  status?: CourseStatus;
  hostId?: string;
}): Promise<Course[]> {
  const conditions: string[] = ["c.status = 'live'"];
  const values: unknown[] = [];
  let idx = 1;

  if (filters.level) { conditions.push(`c.level = $${idx++}`); values.push(filters.level); }
  if (filters.hostId) { conditions.push(`c.host_id = $${idx++}`); values.push(filters.hostId); }

  return query<Course>(
    `SELECT c.*, u.full_name AS host_name
     FROM learning.courses c
     LEFT JOIN identity.users u ON u.id = c.host_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.total_students DESC`,
    values
  );
}

export async function getCourse(courseId: string): Promise<Course> {
  const course = await queryOne<Course>(
    `SELECT c.*, u.full_name AS host_name
     FROM learning.courses c
     LEFT JOIN identity.users u ON u.id = c.host_id
     WHERE c.id = $1`,
    [courseId]
  );
  if (!course) throw new AppError(404, 'Course not found');
  return course;
}

export async function createCourse(
  hostId: string,
  data: {
    title: string;
    description?: string;
    level: CourseLevel;
    price: number;
    duration_weeks?: number;
    emoji?: string;
  }
): Promise<Course> {
  const [course] = await query<Course>(
    `INSERT INTO learning.courses (host_id, title, description, level, price, duration_weeks, emoji)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [hostId, data.title, data.description, data.level, data.price, data.duration_weeks, data.emoji]
  );
  return course;
}

export async function updateCourse(
  courseId: string,
  hostId: string,
  role: string,
  updates: Partial<Pick<Course, 'title' | 'description' | 'level' | 'price' | 'duration_weeks' | 'emoji' | 'status'>>
): Promise<Course> {
  const existing = await queryOne<Course>(
    `SELECT id, host_id FROM learning.courses WHERE id = $1`,
    [courseId]
  );
  if (!existing) throw new AppError(404, 'Course not found');
  if (role !== 'admin' && existing.host_id !== hostId) throw new AppError(403, 'Not your course');

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const allowed: Array<keyof typeof updates> = ['title', 'description', 'level', 'price', 'duration_weeks', 'emoji', 'status'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push(`updated_at = NOW()`);
  values.push(courseId);

  const [course] = await query<Course>(
    `UPDATE learning.courses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return course;
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export async function enroll(userId: string, courseId: string): Promise<Enrollment> {
  const course = await queryOne<Course>(
    `SELECT id, host_id, status FROM learning.courses WHERE id = $1`,
    [courseId]
  );
  if (!course) throw new AppError(404, 'Course not found');
  if (course.status !== 'live') throw new AppError(400, 'Course is not available for enrollment');

  const existing = await queryOne<Enrollment>(
    `SELECT id FROM learning.enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (existing) throw new AppError(409, 'Already enrolled');

  const [enrollment] = await query<Enrollment>(
    `INSERT INTO learning.enrollments (user_id, course_id) VALUES ($1, $2) RETURNING *`,
    [userId, courseId]
  );

  // Update course and host counters
  await query(
    `UPDATE learning.courses SET total_students = total_students + 1 WHERE id = $1`,
    [courseId]
  );
  if (course.host_id) {
    await identitySvc.incrementHostStudents(course.host_id, 1);
  }

  return enrollment;
}

export async function getMyEnrollments(userId: string): Promise<(Enrollment & { course: Course })[]> {
  return query<Enrollment & { course: Course }>(
    `SELECT e.*,
       c.title AS course_title, c.level AS course_level, c.emoji AS course_emoji,
       c.price AS course_price, c.avg_rating AS course_avg_rating
     FROM learning.enrollments e
     JOIN learning.courses c ON c.id = e.course_id
     WHERE e.user_id = $1
     ORDER BY e.enrolled_at DESC`,
    [userId]
  );
}

export async function updateProgress(
  userId: string,
  courseId: string,
  progressPct: number
): Promise<Enrollment> {
  if (progressPct < 0 || progressPct > 100) throw new AppError(400, 'progress_pct must be 0–100');

  const completedAt = progressPct === 100 ? 'NOW()' : 'NULL';
  const status = progressPct === 100 ? 'completed' : 'active';

  const [enrollment] = await query<Enrollment>(
    `UPDATE learning.enrollments
     SET progress_pct = $1, status = $2, completed_at = ${completedAt}
     WHERE user_id = $3 AND course_id = $4
     RETURNING *`,
    [progressPct, status, userId, courseId]
  );
  if (!enrollment) throw new AppError(404, 'Enrollment not found');
  return enrollment;
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function submitReview(
  userId: string,
  courseId: string,
  rating: number,
  body?: string
): Promise<Review> {
  // Must be enrolled
  const enrollment = await queryOne<Enrollment>(
    `SELECT id FROM learning.enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  if (!enrollment) throw new AppError(403, 'Must be enrolled to review');

  const [review] = await query<Review>(
    `INSERT INTO learning.reviews (user_id, course_id, rating, body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, course_id)
     DO UPDATE SET rating = $3, body = $4
     RETURNING *`,
    [userId, courseId, rating, body]
  );

  // Recalculate course avg rating
  const [{ avg }] = await query<{ avg: string }>(
    `SELECT ROUND(AVG(rating)::numeric, 2) AS avg FROM learning.reviews WHERE course_id = $1`,
    [courseId]
  );
  await query(
    `UPDATE learning.courses SET avg_rating = $1 WHERE id = $2`,
    [parseFloat(avg), courseId]
  );

  // Recalculate host avg rating
  const course = await queryOne<Course>(`SELECT host_id FROM learning.courses WHERE id = $1`, [courseId]);
  if (course?.host_id) {
    const [{ host_avg }] = await query<{ host_avg: string }>(
      `SELECT ROUND(AVG(r.rating)::numeric, 2) AS host_avg
       FROM learning.reviews r
       JOIN learning.courses c ON c.id = r.course_id
       WHERE c.host_id = $1`,
      [course.host_id]
    );
    await identitySvc.updateHostRating(course.host_id, parseFloat(host_avg));
  }

  return review;
}

export async function getCourseReviews(courseId: string): Promise<(Review & { user_name: string })[]> {
  return query<Review & { user_name: string }>(
    `SELECT r.*, u.full_name AS user_name
     FROM learning.reviews r
     JOIN identity.users u ON u.id = r.user_id
     WHERE r.course_id = $1
     ORDER BY r.created_at DESC`,
    [courseId]
  );
}
