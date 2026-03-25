CREATE SCHEMA IF NOT EXISTS learning;

CREATE TABLE IF NOT EXISTS learning.courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id         UUID REFERENCES identity.users(id) ON DELETE SET NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  level           VARCHAR(20) NOT NULL
                    CHECK (level IN ('beginner','intermediate','advanced')),
  price           NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  duration_weeks  INT CHECK (duration_weeks > 0),
  emoji           VARCHAR(10),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','live','paused','archived')),
  avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_students  INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning.enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES learning.courses(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','refunded')),
  progress_pct  INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS learning.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES learning.courses(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_host ON learning.courses(host_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON learning.courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_level ON learning.courses(level);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON learning.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON learning.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_reviews_course ON learning.reviews(course_id);
