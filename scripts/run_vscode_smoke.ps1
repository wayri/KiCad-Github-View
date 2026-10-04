$ErrorActionPreference = 'Stop'
$stepTaskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stepDemo = Join-Path $stepTaskRoot '.vizdiff/vscode-demo-project'
$stepResult = Join-Path $stepTaskRoot '.vizdiff/vscode-host-smoke/result.json'
if (-not (Test-Path -LiteralPath (Join-Path $stepDemo 'models/cube.stp'))) {
    throw 'Prepare the disposable demo and its owned STEP fixture before running.'
}
$stepCode = (Get-Command code -ErrorAction Stop).Source
$stepRunId = [Guid]::NewGuid().ToString("N")
$stepArgs = @(
    "--extensionDevelopmentPath=$stepTaskRoot/vscode-extension",
    "--extensionTestsPath=$stepTaskRoot/vscode-extension/tests/native-smoke.js",
    "--user-data-dir=$stepTaskRoot/.vizdiff/vscode-step-smoke-data",
    "--extensions-dir=$stepTaskRoot/.vizdiff/vscode-step-smoke-extensions",
    '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--new-window', '--wait', $stepDemo
)
# Explicit quotes preserve paths containing spaces in Start-Process argument strings.
$stepQuoted = $stepArgs | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
$stepProc = Start-Process -FilePath $stepCode -WindowStyle Hidden -ArgumentList $stepQuoted -Environment @{ KICAD_SMOKE_RUN_ID = $stepRunId } -PassThru
if (-not $stepProc.WaitForExit(60000)) {
    throw "The isolated VS Code test has not exited (PID $($stepProc.Id)); inspect it before retrying."
}
# The CLI can return zero even when the extension test fails. Require fresh evidence.
if (-not (Test-Path -LiteralPath $stepResult)) { throw 'Native smoke produced no result; inspect the isolated profile logs.' }
$stepEvidence = Get-Content -LiteralPath $stepResult -Raw | ConvertFrom-Json
if ($stepEvidence.runId -ne $stepRunId) { throw 'Native smoke result is stale or belongs to another run.' }
foreach ($stepCheck in @('activated', 'schematicEditorOpened', 'boardEditorOpened', 'stepAssetRead', 'sidecarPersisted', 'sourcesUnchanged')) {
    if ($stepEvidence.$stepCheck -ne $true) { throw "Native smoke did not prove $stepCheck." }
}
$stepEvidence | ConvertTo-Json
