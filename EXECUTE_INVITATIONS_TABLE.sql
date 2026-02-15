-- Execute this SQL in Supabase SQL Editor to create the invitations table

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  invited_by VARCHAR(255) NOT NULL,
  accepted_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Create indexes for faster lookups
CREATE UNIQUE INDEX idx_unique_pending_invitation 
  ON invitations(email, organization_id) 
  WHERE accepted_at IS NULL;

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email_org ON invitations(email, organization_id);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);

-- Enable RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read valid (non-expired, not accepted) invitations by token
-- This allows public signup link validation
CREATE POLICY "Anyone can view valid invitations"
  ON invitations FOR SELECT
  USING (
    expires_at > NOW() AND accepted_at IS NULL
  );

-- RLS Policy: Authenticated users can create invitations for their organization
CREATE POLICY "Authenticated users can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- RLS Policy: Authenticated users can delete invitations 
CREATE POLICY "Authenticated users can revoke invitations"
  ON invitations FOR DELETE
  USING (auth.role() = 'authenticated');

-- RLS Policy: Authenticated users can update invitations (to mark as accepted)
CREATE POLICY "Authenticated users can update invitations"
  ON invitations FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
