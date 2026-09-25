CREATE TABLE tenant_agents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_slug text NOT NULL REFERENCES agent_templates(slug),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  installed_version integer NOT NULL DEFAULT 1 CHECK (installed_version >= 1),
  installed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_slug)
);

CREATE INDEX tenant_agents_org_status_idx ON tenant_agents (organization_id, status, created_at DESC);
ALTER TABLE tenant_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_agents_select_tenant ON tenant_agents
  FOR SELECT USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_agents_insert_tenant ON tenant_agents
  FOR INSERT WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_agents_update_tenant ON tenant_agents
  FOR UPDATE USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_agents_delete_tenant ON tenant_agents
  FOR DELETE USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
