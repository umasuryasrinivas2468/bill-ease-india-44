-- Create invitations table for tracking user invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  invited_by UUID NOT NULL,
  accepted_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_pending_invitation UNIQUE(email, organization_id) WHERE accepted_at IS NULL,
  CONSTRAINT valid_expiry CHECK (expires_at > created_at),
  CONSTRAINT valid_invite_by FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- Create index for faster lookups
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email_org ON invitations(email, organization_id);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users in organization can see invitations for their org
CREATE POLICY "Users can view invitations in their organization"
  ON invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- RLS Policy: Only org_admin can create invitations
CREATE POLICY "Only org admins can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );

-- Allow public access to get invitation by token (for signup link)
CREATE POLICY "Public can view invitation by valid token"
  ON invitations FOR SELECT
  USING (
    expires_at > NOW() AND accepted_at IS NULL
  );
