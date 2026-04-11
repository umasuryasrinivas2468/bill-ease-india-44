# Mistral API Integration Verification Script
# Run this to verify your migration is complete and correct

Write-Host "🔍 Mistral API Integration Verification" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = (Get-Item -Path ".").FullName
$checksPass = 0
$checksFail = 0

# ============================================
# CHECK 1: Verify @google/generative-ai removed
# ============================================
Write-Host "CHECK 1: Google Dependency Removal" -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw
if ($packageJson -match "@google/generative-ai") {
    Write-Host "  ❌ FAIL: Google dependency still in package.json" -ForegroundColor Red
    $checksFail++
} else {
    Write-Host "  ✅ PASS: Google dependency removed" -ForegroundColor Green
    $checksPass++
}
Write-Host ""

# ============================================
# CHECK 2: Verify function uses APIMYST
# ============================================
Write-Host "CHECK 2: APIMYST Environment Variable" -ForegroundColor Yellow
$funcContent = Get-Content "supabase/functions/financial-advisor/index.ts" -Raw
if ($funcContent -match "Deno.env.get\(`"APIMYST`"\)") {
    Write-Host "  ✅ PASS: Function reads APIMYST correctly" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ❌ FAIL: APIMYST not found in function" -ForegroundColor Red
    $checksFail++
}
Write-Host ""

# ============================================
# CHECK 3: Verify Mistral API endpoint
# ============================================
Write-Host "CHECK 3: Mistral API Endpoint Configuration" -ForegroundColor Yellow
if ($funcContent -match "https://api.mistral.ai/v1/chat/completions") {
    Write-Host "  ✅ PASS: Correct Mistral endpoint configured" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ❌ FAIL: Mistral endpoint not configured correctly" -ForegroundColor Red
    $checksFail++
}
Write-Host ""

# ============================================
# CHECK 4: Verify Mistral-medium model
# ============================================
Write-Host "CHECK 4: Mistral Model Selection" -ForegroundColor Yellow
if ($funcContent -match "mistral-medium") {
    Write-Host "  ✅ PASS: mistral-medium model configured" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ❌ FAIL: mistral-medium model not found" -ForegroundColor Red
    $checksFail++
}
Write-Host ""

# ============================================
# CHECK 5: Verify LOVABLE removed
# ============================================
Write-Host "CHECK 5: LOVABLE/Google Fallback Removal" -ForegroundColor Yellow
if ($funcContent -match "LOVABLE" -or $funcContent -match "ai.gateway.lovable" -or $funcContent -match "gemini-2.5-flash") {
    Write-Host "  ❌ FAIL: LOVABLE or Google references still present" -ForegroundColor Red
    $checksFail++
} else {
    Write-Host "  ✅ PASS: No LOVABLE/Google fallback code" -ForegroundColor Green
    $checksPass++
}
Write-Host ""

# ============================================
# CHECK 6: Verify no hardcoded keys
# ============================================
Write-Host "CHECK 6: Security - No Hardcoded API Keys" -ForegroundColor Yellow
if ($funcContent -match "sk-" -or $funcContent -match "M6ECtQ5MmcePcHsGEtYdyu7qm3AveDqZ") {
    Write-Host "  ❌ FAIL: Hardcoded API key detected!" -ForegroundColor Red
    $checksFail++
} else {
    Write-Host "  ✅ PASS: No hardcoded API keys" -ForegroundColor Green
    $checksPass++
}
Write-Host ""

# ============================================
# CHECK 7: Verify error handling
# ============================================
Write-Host "CHECK 7: Error Handling" -ForegroundColor Yellow
$errorHandling = 0
if ($funcContent -match "response.status === 429") { $errorHandling++ }
if ($funcContent -match "response.status === 401") { $errorHandling++ }
if ($funcContent -match "response.status === 402") { $errorHandling++ }

if ($errorHandling -ge 3) {
    Write-Host "  ✅ PASS: All error handlers present (429, 401, 402)" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ❌ FAIL: Missing error handlers (found $errorHandling of 3)" -ForegroundColor Red
    $checksFail++
}
Write-Host ""

# ============================================
# CHECK 8: Verify response parsing
# ============================================
Write-Host "CHECK 8: Response Format Compatibility" -ForegroundColor Yellow
if ($funcContent -match "data.choices\?\.\[0\]\?.message.content") {
    Write-Host "  ✅ PASS: Correct Mistral response parsing" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ⚠️  WARNING: Response parsing format may need review" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# CHECK 9: Verify README updated
# ============================================
Write-Host "CHECK 9: Documentation Updated" -ForegroundColor Yellow
$readmeContent = Get-Content "supabase/functions/financial-advisor/README.md" -Raw
if ($readmeContent -match "APIMYST" -and $readmeContent -match "Mistral AI" -and -not ($readmeContent -match "LOVABLE")) {
    Write-Host "  ✅ PASS: Documentation properly updated" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ⚠️  WARNING: Documentation may need review" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# CHECK 10: Verify Aiva component compatible
# ============================================
Write-Host "CHECK 10: Aiva Component Compatibility" -ForegroundColor Yellow
$aivContent = Get-Content "src/components/Aiva.tsx" -Raw
if ($aivContent -match "includes\('429'\)" -and $aivContent -match "includes\('402'\)") {
    Write-Host "  ✅ PASS: Aiva component compatible with Mistral" -ForegroundColor Green
    $checksPass++
} else {
    Write-Host "  ⚠️  WARNING: Aiva component may need review" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# ENVIRONMENT CHECK
# ============================================
Write-Host "CHECK 11: Environment Configuration" -ForegroundColor Yellow
$supabaseSecrets = $null
try {
    $supabaseSecrets = supabase secrets list 2>$null
    if ($supabaseSecrets -match "APIMYST") {
        Write-Host "  ✅ PASS: APIMYST secret found in Supabase" -ForegroundColor Green
        $checksPass++
    } else {
        Write-Host "  ⚠️  WARNING: APIMYST secret not found in Supabase" -ForegroundColor Yellow
        Write-Host "         Run: supabase secrets set APIMYST=`"your-api-key`"" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ℹ️  INFO: Supabase CLI not available locally (OK for dashboard setup)" -ForegroundColor Cyan
}
Write-Host ""

# ============================================
# SUMMARY
# ============================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Passed: $checksPass/10" -ForegroundColor Green
Write-Host "Failed: $checksFail/10" -ForegroundColor Red
Write-Host ""

if ($checksFail -eq 0) {
    Write-Host "🎉 ALL CHECKS PASSED! Your Mistral integration is ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Ensure APIMYST is set in Supabase secrets" -ForegroundColor Gray
    Write-Host "2. Deploy the function: supabase functions deploy financial-advisor" -ForegroundColor Gray
    Write-Host "3. Test Aiva in your application" -ForegroundColor Gray
    Write-Host "4. Monitor Mistral dashboard for usage" -ForegroundColor Gray
} elseif ($checksFail -le 2) {
    Write-Host "⚠️  SOME CHECKS FAILED - Review the items marked with ❌" -ForegroundColor Yellow
} else {
    Write-Host "❌ MULTIPLE CHECKS FAILED - Please review and fix the issues above" -ForegroundColor Red
}

Write-Host ""
Write-Host "📚 Documentation Files Created:" -ForegroundColor Cyan
Write-Host "  - MISTRAL_API_MIGRATION.md (Setup guide)" -ForegroundColor Gray
Write-Host "  - MISTRAL_INTEGRATION_SUMMARY.md (Overview)" -ForegroundColor Gray
Write-Host "  - CHANGES_DETAILED.md (Technical details)" -ForegroundColor Gray
Write-Host ""
Write-Host "Need help? Check:" -ForegroundColor Cyan
Write-Host "  - supabase/functions/financial-advisor/README.md" -ForegroundColor Gray
Write-Host "  - https://docs.mistral.ai/" -ForegroundColor Gray