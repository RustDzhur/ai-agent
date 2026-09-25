CREATE TABLE users (
  id uuid PRIMARY KEY,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX organization_memberships_user_idx ON organization_memberships (user_id, created_at);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  active_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_user_created_idx ON audit_logs (user_id, created_at DESC);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_select_member ON organizations
  FOR SELECT USING (
    id = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM organization_memberships membership
      WHERE membership.organization_id = organizations.id
        AND membership.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership.status = 'active'
    )
  );
CREATE POLICY organizations_insert_tenant ON organizations
  FOR INSERT WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY organizations_update_tenant ON organizations
  FOR UPDATE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_select_member_or_tenant ON organization_memberships
  FOR SELECT USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
CREATE POLICY memberships_insert_tenant ON organization_memberships
  FOR INSERT WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY memberships_update_tenant ON organization_memberships
  FOR UPDATE USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY memberships_delete_tenant ON organization_memberships
  FOR DELETE USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select_tenant ON audit_logs
  FOR SELECT USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY audit_logs_insert_tenant ON audit_logs
  FOR INSERT WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
