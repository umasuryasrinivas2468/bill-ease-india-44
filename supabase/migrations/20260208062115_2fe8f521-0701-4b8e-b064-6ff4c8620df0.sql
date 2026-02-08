-- Enterprise Authorization System for Financial Platform

-- 1. Create role enum for the platform
CREATE TYPE public.app_role AS ENUM (
  'super_admin',    -- Platform-wide administrator
  'org_admin',      -- Organization administrator
  'ca',             -- Chartered Accountant (multi-client access)
  'manager',        -- Team manager
  'accountant',     -- Standard user
  'viewer'          -- Read-only access
);

-- 2. Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

-- 3. Create user_roles table (as per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- Clerk user ID
  role app_role NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  granted_by TEXT,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role, organization_id)
);

-- 4. Create user_organizations table for membership
CREATE TABLE public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  invited_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- 5. Create permissions table for granular control
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,  -- e.g., 'invoices:create', 'reports:view'
  name TEXT NOT NULL,
  description TEXT,
  resource TEXT NOT NULL,     -- e.g., 'invoices', 'reports', 'settings'
  action TEXT NOT NULL,       -- e.g., 'create', 'read', 'update', 'delete'
  category TEXT,              -- e.g., 'billing', 'accounting', 'admin'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create role_permissions mapping
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (role, permission_id, organization_id)
);

-- 7. Create CA client assignments (for multi-client switching)
CREATE TABLE public.ca_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_user_id TEXT NOT NULL,
  client_organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  access_level TEXT DEFAULT 'full',  -- 'full', 'limited', 'view_only'
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ca_user_id, client_organization_id)
);

-- 8. Create audit_logs table for compliance tracking
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,           -- e.g., 'invoice.created', 'user.role_changed'
  resource_type TEXT NOT NULL,    -- e.g., 'invoice', 'user', 'organization'
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  severity TEXT DEFAULT 'info',   -- 'info', 'warning', 'critical'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Create user_sessions table for concurrent user tracking
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  device_info JSONB DEFAULT '{}',
  ip_address INET,
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Create indexes for performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_org_id ON public.user_roles(organization_id);
CREATE INDEX idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON public.user_organizations(organization_id);
CREATE INDEX idx_ca_assignments_ca_user ON public.ca_client_assignments(ca_user_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_org_id ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(is_active) WHERE is_active = true;

-- 11. Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_client_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- 12. Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role app_role, _org_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (_org_id IS NULL OR organization_id = _org_id OR organization_id IS NULL)
  )
$$;

-- 13. Function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin', NULL)
$$;

-- 14. Function to check organization membership
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id TEXT, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND is_active = true
  )
$$;

-- 15. Function to check CA client access
CREATE OR REPLACE FUNCTION public.has_ca_access(_user_id TEXT, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ca_client_assignments
    WHERE ca_user_id = _user_id
      AND client_organization_id = _org_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- 16. Function to check permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id TEXT, _permission_code TEXT, _org_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.code = _permission_code
      AND p.is_active = true
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
      AND (_org_id IS NULL OR ur.organization_id = _org_id OR ur.organization_id IS NULL)
  )
$$;

-- 17. Function to get user's accessible organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations(_user_id TEXT)
RETURNS TABLE(organization_id UUID, role app_role, is_ca_client BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Direct organization memberships
  SELECT 
    uo.organization_id,
    COALESCE(ur.role, 'viewer'::app_role) as role,
    false as is_ca_client
  FROM public.user_organizations uo
  LEFT JOIN public.user_roles ur ON ur.user_id = uo.user_id 
    AND ur.organization_id = uo.organization_id
    AND ur.is_active = true
  WHERE uo.user_id = _user_id AND uo.is_active = true
  
  UNION
  
  -- CA client assignments
  SELECT 
    cca.client_organization_id as organization_id,
    'ca'::app_role as role,
    true as is_ca_client
  FROM public.ca_client_assignments cca
  WHERE cca.ca_user_id = _user_id 
    AND cca.is_active = true
    AND (cca.expires_at IS NULL OR cca.expires_at > now())
$$;

-- 18. RLS Policies for organizations
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.is_org_member(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), id)
    OR public.has_ca_access(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), id)
  );

CREATE POLICY "Org admins can update their organizations"
  ON public.organizations FOR UPDATE
  USING (
    public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', id)
  );

CREATE POLICY "Super admins can insert organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (
    public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) IS NOT NULL
  );

-- 19. RLS Policies for user_roles
CREATE POLICY "Users can view roles in their orgs"
  ON public.user_roles FOR SELECT
  USING (
    user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', organization_id)
  );

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (
    public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', organization_id)
  );

-- 20. RLS Policies for user_organizations
CREATE POLICY "Users can view their memberships"
  ON public.user_organizations FOR SELECT
  USING (
    user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', organization_id)
  );

CREATE POLICY "Admins can manage memberships"
  ON public.user_organizations FOR ALL
  USING (
    public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', organization_id)
  );

-- 21. RLS Policies for permissions (read-only for most)
CREATE POLICY "Anyone authenticated can view permissions"
  ON public.permissions FOR SELECT
  USING (((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) IS NOT NULL);

CREATE POLICY "Only super admins can manage permissions"
  ON public.permissions FOR ALL
  USING (public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)));

-- 22. RLS Policies for role_permissions
CREATE POLICY "Anyone authenticated can view role_permissions"
  ON public.role_permissions FOR SELECT
  USING (((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) IS NOT NULL);

CREATE POLICY "Only super admins can manage role_permissions"
  ON public.role_permissions FOR ALL
  USING (public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)));

-- 23. RLS Policies for CA assignments
CREATE POLICY "CAs can view their assignments"
  ON public.ca_client_assignments FOR SELECT
  USING (
    ca_user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
  );

CREATE POLICY "Admins can manage CA assignments"
  ON public.ca_client_assignments FOR ALL
  USING (public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)));

-- 24. RLS Policies for audit_logs (append-only)
CREATE POLICY "Users can view audit logs in their orgs"
  ON public.audit_logs FOR SELECT
  USING (
    user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
    OR public.has_role(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text), 'org_admin', organization_id)
  );

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text) IS NOT NULL);

-- 25. RLS Policies for user_sessions
CREATE POLICY "Users can view their sessions"
  ON public.user_sessions FOR SELECT
  USING (
    user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
  );

CREATE POLICY "Users can manage their sessions"
  ON public.user_sessions FOR ALL
  USING (
    user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text)
    OR public.is_super_admin(((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
  );

-- 26. Insert default permissions
INSERT INTO public.permissions (code, name, description, resource, action, category) VALUES
-- Invoice permissions
('invoices:create', 'Create Invoices', 'Create new invoices', 'invoices', 'create', 'billing'),
('invoices:read', 'View Invoices', 'View invoice details', 'invoices', 'read', 'billing'),
('invoices:update', 'Edit Invoices', 'Modify existing invoices', 'invoices', 'update', 'billing'),
('invoices:delete', 'Delete Invoices', 'Delete invoices', 'invoices', 'delete', 'billing'),
('invoices:export', 'Export Invoices', 'Export invoices to PDF/Excel', 'invoices', 'export', 'billing'),

-- Quotation permissions
('quotations:create', 'Create Quotations', 'Create new quotations', 'quotations', 'create', 'billing'),
('quotations:read', 'View Quotations', 'View quotation details', 'quotations', 'read', 'billing'),
('quotations:update', 'Edit Quotations', 'Modify existing quotations', 'quotations', 'update', 'billing'),
('quotations:delete', 'Delete Quotations', 'Delete quotations', 'quotations', 'delete', 'billing'),

-- Client permissions
('clients:create', 'Create Clients', 'Add new clients', 'clients', 'create', 'crm'),
('clients:read', 'View Clients', 'View client details', 'clients', 'read', 'crm'),
('clients:update', 'Edit Clients', 'Modify client information', 'clients', 'update', 'crm'),
('clients:delete', 'Delete Clients', 'Remove clients', 'clients', 'delete', 'crm'),

-- Vendor permissions
('vendors:create', 'Create Vendors', 'Add new vendors', 'vendors', 'create', 'procurement'),
('vendors:read', 'View Vendors', 'View vendor details', 'vendors', 'read', 'procurement'),
('vendors:update', 'Edit Vendors', 'Modify vendor information', 'vendors', 'update', 'procurement'),
('vendors:delete', 'Delete Vendors', 'Remove vendors', 'vendors', 'delete', 'procurement'),

-- Expense permissions
('expenses:create', 'Create Expenses', 'Record new expenses', 'expenses', 'create', 'accounting'),
('expenses:read', 'View Expenses', 'View expense details', 'expenses', 'read', 'accounting'),
('expenses:update', 'Edit Expenses', 'Modify expenses', 'expenses', 'update', 'accounting'),
('expenses:delete', 'Delete Expenses', 'Delete expenses', 'expenses', 'delete', 'accounting'),
('expenses:approve', 'Approve Expenses', 'Approve expense claims', 'expenses', 'approve', 'accounting'),

-- Report permissions
('reports:view', 'View Reports', 'Access financial reports', 'reports', 'read', 'reporting'),
('reports:export', 'Export Reports', 'Export reports', 'reports', 'export', 'reporting'),
('reports:gst', 'GST Reports', 'Access GST filing reports', 'reports', 'gst', 'compliance'),
('reports:tds', 'TDS Reports', 'Access TDS reports', 'reports', 'tds', 'compliance'),

-- Accounting permissions
('journals:create', 'Create Journals', 'Create journal entries', 'journals', 'create', 'accounting'),
('journals:read', 'View Journals', 'View journal entries', 'journals', 'read', 'accounting'),
('journals:update', 'Edit Journals', 'Modify journal entries', 'journals', 'update', 'accounting'),
('journals:post', 'Post Journals', 'Post journal entries', 'journals', 'post', 'accounting'),

-- Admin permissions
('users:invite', 'Invite Users', 'Invite new users', 'users', 'invite', 'admin'),
('users:manage', 'Manage Users', 'Manage user accounts', 'users', 'manage', 'admin'),
('roles:manage', 'Manage Roles', 'Assign and modify roles', 'roles', 'manage', 'admin'),
('settings:manage', 'Manage Settings', 'Configure organization settings', 'settings', 'manage', 'admin'),
('audit:view', 'View Audit Logs', 'Access audit trail', 'audit', 'view', 'compliance'),

-- Inventory permissions
('inventory:create', 'Create Inventory', 'Add inventory items', 'inventory', 'create', 'inventory'),
('inventory:read', 'View Inventory', 'View inventory', 'inventory', 'read', 'inventory'),
('inventory:update', 'Edit Inventory', 'Modify inventory', 'inventory', 'update', 'inventory'),
('inventory:delete', 'Delete Inventory', 'Remove inventory items', 'inventory', 'delete', 'inventory'),

-- Banking permissions
('banking:view', 'View Banking', 'Access banking information', 'banking', 'read', 'banking'),
('banking:reconcile', 'Bank Reconciliation', 'Perform bank reconciliation', 'banking', 'reconcile', 'banking'),
('payments:create', 'Create Payments', 'Make payments', 'payments', 'create', 'banking'),
('payments:approve', 'Approve Payments', 'Approve payment requests', 'payments', 'approve', 'banking');

-- 27. Assign default permissions to roles
-- Super Admin gets all permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'super_admin', id FROM public.permissions;

-- Org Admin gets most permissions except super admin specific
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'org_admin', id FROM public.permissions 
WHERE code NOT IN ('roles:manage');

-- CA gets full access for client work
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'ca', id FROM public.permissions 
WHERE category IN ('billing', 'accounting', 'reporting', 'compliance', 'crm', 'procurement', 'inventory')
   OR code IN ('audit:view');

-- Manager gets operational permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'manager', id FROM public.permissions 
WHERE action IN ('create', 'read', 'update', 'export', 'approve')
  AND category IN ('billing', 'accounting', 'crm', 'procurement', 'inventory', 'reporting');

-- Accountant gets standard accounting permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'accountant', id FROM public.permissions 
WHERE action IN ('create', 'read', 'update')
  AND category IN ('billing', 'accounting', 'crm', 'procurement', 'inventory');

-- Viewer gets read-only permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'viewer', id FROM public.permissions 
WHERE action = 'read';

-- 28. Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_organizations_updated_at
  BEFORE UPDATE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER ca_client_assignments_updated_at
  BEFORE UPDATE ON public.ca_client_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();