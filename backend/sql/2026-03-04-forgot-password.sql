-- Forgot password support on existing pmx_users table.
-- No new table is required for this implementation.

ALTER TABLE pmx_users
  ADD COLUMN reset_password_token VARCHAR(64) NULL,
  ADD COLUMN reset_password_expires DATETIME NULL;

-- Optional but recommended for quick token lookups.
CREATE INDEX idx_pmx_users_reset_token ON pmx_users (reset_password_token);

