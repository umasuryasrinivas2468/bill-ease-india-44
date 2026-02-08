import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import { AITaxAdvisorService } from '@/services/aiTaxAdvisorService';
import { FinancialDataService } from '@/services/financialDataService';
import type {
  FinancialSummary,
  AITaxAnalysisResult,
  AITaxRequest,
  AITaxResponse
} from '@/types/aiTaxAdvisor';

export const useAITaxAdvisor = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get financial data for a specific year
  const useFinancialData = (financialYear: string) => {
    return useQuery({
      queryKey: ['financial-data', user?.id, financialYear],
      queryFn: async () => {
        if (!user || !isValidUserId(user.id)) {
          throw new Error('User not authenticated or invalid user ID');
        }
        const normalizedUserId = normalizeUserId(user.id);
        return FinancialDataService.aggregateFinancialData(normalizedUserId, financialYear);
      },
      enabled: !!user && isValidUserId(user?.id) && !!financialYear,
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  };

  // Get analysis history
  const useAnalysisHistory = () => {
    return useQuery({
      queryKey: ['ai-tax-analysis-history', user?.id],
      queryFn: async () => {
        if (!user || !isValidUserId(user.id)) {
          throw new Error('User not authenticated or invalid user ID');
        }
        const normalizedUserId = normalizeUserId(user.id);
        return AITaxAdvisorService.getAnalysisHistory(normalizedUserId);
      },
      enabled: !!user && isValidUserId(user?.id),
      staleTime: 2 * 60 * 1000, // 2 minutes
    });
  };

  // Get specific analysis by ID
  const useAnalysisById = (analysisId: string) => {
    return useQuery({
      queryKey: ['ai-tax-analysis', user?.id, analysisId],
      queryFn: async () => {
        if (!user || !isValidUserId(user.id)) {
          throw new Error('User not authenticated or invalid user ID');
        }
        const normalizedUserId = normalizeUserId(user.id);
        return AITaxAdvisorService.getAnalysisById(normalizedUserId, analysisId);
      },
      enabled: !!user && isValidUserId(user?.id) && !!analysisId,
    });
  };

  // Generate new tax analysis
  const useGenerateAnalysis = () => {
    return useMutation({
      mutationFn: async ({ financialSummary, financialYear }: { 
        financialSummary: FinancialSummary, 
        financialYear: string 
      }) => {
        if (!user || !isValidUserId(user.id)) {
          throw new Error('User not authenticated or invalid user ID');
        }
        const normalizedUserId = normalizeUserId(user.id);

        // Generate AI analysis
        const analysisResult = await AITaxAdvisorService.generateTaxAnalysis(
          normalizedUserId, 
          financialSummary
        );

        // Save the result
        const analysisId = await AITaxAdvisorService.saveAnalysisResult(
          normalizedUserId,
          financialYear,
          analysisResult,
          financialSummary
        );

        return { analysisId, ...analysisResult };
      },
      onSuccess: (result) => {
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['ai-tax-analysis-history'] });
        
        toast({
          title: "Tax Analysis Generated",
          description: "AI-powered tax analysis has been generated successfully.",
        });
      },
      onError: (error) => {
        console.error('Error generating tax analysis:', error);
        toast({
          title: "Analysis Failed",
          description: "Failed to generate tax analysis. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  // Get financial year options
  const getFinancialYearOptions = () => {
    return FinancialDataService.generateFinancialYearOptions();
  };

  return {
    useFinancialData,
    useAnalysisHistory,
    useAnalysisById,
    useGenerateAnalysis,
    getFinancialYearOptions,
  };
};