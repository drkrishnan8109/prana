import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import { User, HostProfile, HostTier } from '../../types';

// ─── Host tier thresholds ────────────────────────────────────────────────────
const TIER_THRESHOLDS = {
  grove_master: { students: 200, rating: 4.8 },
  verified:     { students: 50,  rating: 4.5 },
};

function resolveHostTier(totalStudents: number, avgRating: number): HostTier {
  if (totalStudents >= TIER_THRESHOLDS.grove_master.students && avgRating >= TIER_THRESHOLDS.grove_master.rating) {
    return 'grove_master';
  }
  if (totalStudents >= TIER_THRESHOLDS.verified.students && avgRating >= TIER_THRESHOLDS.verified.rating) {
    return 'verified';
  }
  return 'starter';
}

const COMMISSION_RATES: Record<HostTier, number> = {
  starter:      0.70,
  verified:     0.80,
  grove_master: 0.90,
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  fullName: string,
  role: 'student' | 'host'
): Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'password_hash'> }> {
  const existing = await queryOne<User>(
    'SELECT id FROM identity.users WHERE email = $1',
    [email]
  );
  if (existing) throw new AppError(409, 'Email already in use');

  const password_hash = await bcrypt.hash(password, 12);
  const [user] = await query<User>(
    `INSERT INTO identity.users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, role, avatar_url, status, created_at, updated_at`,
    [email, password_hash, fullName, role]
  );

  if (role === 'host') {
    await query(
      `INSERT INTO identity.host_profiles (user_id) VALUES ($1)`,
      [user.id]
    );
  }

  const { accessToken, refreshToken } = await generateTokens(user);
  const { password_hash: _, ...safeUser } = user as User;
  return { accessToken, refreshToken, user: safeUser as Omit<User, 'password_hash'> };
}

export async function login(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'password_hash'> }> {
  const user = await queryOne<User>(
    `SELECT * FROM identity.users WHERE email = $1`,
    [email]
  );
  if (!user) throw new AppError(401, 'Invalid email or password');
  if (user.status === 'banned') throw new AppError(403, 'Account suspended');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError(401, 'Invalid email or password');

  const { accessToken, refreshToken } = await generateTokens(user);
  const { password_hash: _, ...safeUser } = user;
  return { accessToken, refreshToken, user: safeUser as Omit<User, 'password_hash'> };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string }> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await queryOne<{ user_id: string; expires_at: Date }>(
    `SELECT user_id, expires_at FROM identity.refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  if (!stored || stored.expires_at < new Date()) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
  const user = await queryOne<User>(
    `SELECT id, email, role FROM identity.users WHERE id = $1`,
    [stored.user_id]
  );
  if (!user) throw new AppError(401, 'User not found');

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'] }
  );
  return { accessToken };
}

export async function logout(userId: string): Promise<void> {
  await query(
    `DELETE FROM identity.refresh_tokens WHERE user_id = $1`,
    [userId]
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Omit<User, 'password_hash'> & { host_profile?: HostProfile }> {
  const user = await queryOne<User>(
    `SELECT id, email, full_name, role, avatar_url, status, created_at, updated_at
     FROM identity.users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new AppError(404, 'User not found');

  let host_profile: HostProfile | undefined;
  if (user.role === 'host') {
    host_profile = await queryOne<HostProfile>(
      `SELECT * FROM identity.host_profiles WHERE user_id = $1`,
      [userId]
    ) ?? undefined;
  }
  return { ...user, host_profile };
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string; avatar_url?: string }
): Promise<Omit<User, 'password_hash'>> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.full_name) { fields.push(`full_name = $${idx++}`); values.push(updates.full_name); }
  if (updates.avatar_url) { fields.push(`avatar_url = $${idx++}`); values.push(updates.avatar_url); }
  if (fields.length === 0) throw new AppError(400, 'No fields to update');

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const [user] = await query<Omit<User, 'password_hash'>>(
    `UPDATE identity.users SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, email, full_name, role, avatar_url, status, created_at, updated_at`,
    values
  );
  return user;
}

export async function updateHostProfile(
  userId: string,
  updates: { bio?: string; stripe_account_id?: string }
): Promise<HostProfile> {
  const existing = await queryOne<HostProfile>(
    `SELECT id FROM identity.host_profiles WHERE user_id = $1`,
    [userId]
  );
  if (!existing) throw new AppError(404, 'Host profile not found');

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.bio !== undefined) { fields.push(`bio = $${idx++}`); values.push(updates.bio); }
  if (updates.stripe_account_id) { fields.push(`stripe_account_id = $${idx++}`); values.push(updates.stripe_account_id); }
  if (fields.length === 0) throw new AppError(400, 'No fields to update');
  values.push(userId);

  const [profile] = await query<HostProfile>(
    `UPDATE identity.host_profiles SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING *`,
    values
  );
  return profile;
}

// Called by Learning service after a new enrollment or review
export async function recalculateHostTier(hostId: string): Promise<void> {
  const profile = await queryOne<HostProfile>(
    `SELECT total_students, avg_rating FROM identity.host_profiles WHERE user_id = $1`,
    [hostId]
  );
  if (!profile) return;

  const tier = resolveHostTier(profile.total_students, profile.avg_rating);
  const commission_rate = COMMISSION_RATES[tier];

  await query(
    `UPDATE identity.host_profiles
     SET tier = $1, commission_rate = $2
     WHERE user_id = $3`,
    [tier, commission_rate, hostId]
  );
}

export async function incrementHostStudents(hostId: string, delta: number): Promise<void> {
  await query(
    `UPDATE identity.host_profiles
     SET total_students = total_students + $1
     WHERE user_id = $2`,
    [delta, hostId]
  );
  await recalculateHostTier(hostId);
}

export async function updateHostRating(hostId: string, newAvgRating: number): Promise<void> {
  await query(
    `UPDATE identity.host_profiles SET avg_rating = $1 WHERE user_id = $2`,
    [newAvgRating, hostId]
  );
  await recalculateHostTier(hostId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateTokens(
  user: Pick<User, 'id' | 'email' | 'role'>
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'] }
  );

  const rawRefresh = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO identity.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken: rawRefresh };
}
