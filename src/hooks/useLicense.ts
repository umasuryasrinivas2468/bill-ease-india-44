import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generateLicenseKey, calculateDueDate } from '@/utils/licenseUtils';
import { sendLicenseEmail } from '@/services/emailService';

export interface LicenseData {
  id: string;
  email: string;
  license_key: string;
  plan_type: string;
  date_created: string;
  due_date: string;
}

export const useLicense = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('license')
        .select('email')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return !!data;
    } catch (err) {
      console.error('Error checking email:', err);
      throw new Error('Failed to check email');
    }
  };

  const generateLicense = async (
    email: string,
    planType: 'starter' | 'growth' | 'scale'
  ): Promise<LicenseData> => {
    setLoading(true);
    setError(null);

    try {
      // Check if email already exists
      const emailExists = await checkEmailExists(email);
      
      if (emailExists) {
        throw new Error('Email already has a license key');
      }

      // Generate unique license key
      let licenseKey: string;
      let keyExists = true;
      
      do {
        licenseKey = generateLicenseKey(planType);
        const { data: existingKey } = await supabase
          .from('license')
          .select('license_key')
          .eq('license_key', licenseKey)
          .single();
        
        keyExists = !!existingKey;
      } while (keyExists);

      // Insert new license
      const dueDate = calculateDueDate();
      
      const { data, error } = await supabase
        .from('license')
        .insert({
          email,
          license_key: licenseKey,
          plan_type: planType,
          due_date: dueDate.toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const licenseData = data as LicenseData;

      // Send email with license details
      try {
        const emailResult = await sendLicenseEmail({
          email: licenseData.email,
          licenseKey: licenseData.license_key,
          planType: licenseData.plan_type,
          expiryDate: new Date(licenseData.due_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        });

        if (!emailResult.success) {
          console.error('Failed to send license email:', emailResult.error);
          // Don't fail the license generation if email fails
        }
      } catch (emailError) {
        console.error('Error sending license email:', emailError);
        // Don't fail the license generation if email fails
      }

      return licenseData;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to generate license';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getLicense = async (email: string): Promise<LicenseData | null> => {
    try {
      const { data, error } = await supabase
        .from('license')
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as LicenseData | null;
    } catch (err) {
      console.error('Error getting license:', err);
      return null;
    }
  };

  return {
    loading,
    error,
    generateLicense,
    getLicense,
    checkEmailExists,
  };
};