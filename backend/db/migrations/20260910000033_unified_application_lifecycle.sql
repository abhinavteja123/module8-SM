-- A student can explicitly revoke a self-internship request before it is
-- finally activated, just as they can revoke research and CRCS applications.
ALTER TYPE self_internship_status_enum ADD VALUE IF NOT EXISTS 'revoked';
