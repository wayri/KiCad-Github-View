param([string]$SigningDirectory = (Join-Path $env:LOCALAPPDATA 'PocketKiVi\signing'))
$ErrorActionPreference = 'Stop'
# Only DPAPI ciphertext is stored alongside the key, outside the checkout.
$taskKey = Join-Path $SigningDirectory 'play-upload.p12'
$taskPasswordFile = Join-Path $SigningDirectory 'play-upload-password.dpapi'
if (!(Test-Path -LiteralPath $taskKey) -or !(Test-Path -LiteralPath $taskPasswordFile)) { throw 'Upload key setup is missing. See docs/play-store/SUBMISSION.md.' }
$taskNames = @('POCKET_KIVI_KEYSTORE','POCKET_KIVI_STORE_PASSWORD','POCKET_KIVI_KEY_ALIAS','POCKET_KIVI_KEY_PASSWORD')
$taskPrevious = @{}
foreach ($taskName in $taskNames) { $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName,'Process') }
try {
 $taskSecure = Get-Content -LiteralPath $taskPasswordFile | ConvertTo-SecureString
 $env:POCKET_KIVI_STORE_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecure).Password
 $env:POCKET_KIVI_KEY_PASSWORD = $env:POCKET_KIVI_STORE_PASSWORD
 $env:POCKET_KIVI_KEYSTORE = $taskKey
 $env:POCKET_KIVI_KEY_ALIAS = 'pocket-kivi-upload'
 Push-Location (Join-Path $PSScriptRoot '../android-app')
 try { & ./gradlew.bat bundlePlayRelease; if ($LASTEXITCODE -ne 0) { throw 'Play bundle build failed.' } } finally { Pop-Location }
} finally {
 foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process') }
 $taskSecure = $null
}
