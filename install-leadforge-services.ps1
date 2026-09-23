param(
    [switch]$Reinstall
)

$ErrorActionPreference = 'Stop'

$projectRoot = 'C:\www\Mikeia\www\LeadForge\LeadForge'
$nssm = 'C:\www\nssm-2.24\win64\nssm.exe'
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
$playwrightBrowsers = Join-Path $projectRoot '.playwright-browsers'
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$backendService = 'LeadForge-Backend'
$frontendService = 'LeadForge-Frontend'
$logDirectory = Join-Path $projectRoot 'service-logs'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute este script em um PowerShell aberto como Administrator.'
}

foreach ($path in @($projectRoot, $nssm, $python, $npm)) {
    if (-not (Test-Path $path)) {
        throw "Caminho não encontrado: $path"
    }
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

foreach ($service in @($backendService, $frontendService)) {
    $existing = Get-Service -Name $service -ErrorAction SilentlyContinue
    if ($existing) {
        if (-not $Reinstall) {
            throw "O serviço $service já existe. Use -Reinstall para recriá-lo."
        }
        & $nssm stop $service | Out-Null
        & $nssm remove $service confirm | Out-Null
    }
}

& $nssm install $backendService $python '-m uvicorn main:app --host 0.0.0.0 --port 8000'
& $nssm set $backendService DisplayName 'LeadForge Backend'
& $nssm set $backendService Description 'LeadForge FastAPI scraper backend'
& $nssm set $backendService AppDirectory (Join-Path $projectRoot 'backend')
& $nssm set $backendService AppStdout (Join-Path $logDirectory 'backend.log')
& $nssm set $backendService AppStderr (Join-Path $logDirectory 'backend.err')
& $nssm set $backendService AppEnvironmentExtra "PLAYWRIGHT_BROWSERS_PATH=$playwrightBrowsers"
& $nssm set $backendService Start SERVICE_AUTO_START
& $nssm set $backendService AppExit Default Restart
& $nssm set $backendService AppRestartDelay 5000

& $nssm install $frontendService $npm 'run dev'
& $nssm set $frontendService DisplayName 'LeadForge Frontend'
& $nssm set $frontendService Description 'LeadForge Vite frontend server'
& $nssm set $frontendService AppDirectory $projectRoot
& $nssm set $frontendService AppStdout (Join-Path $logDirectory 'frontend.log')
& $nssm set $frontendService AppStderr (Join-Path $logDirectory 'frontend.err')
& $nssm set $frontendService Start SERVICE_AUTO_START
& $nssm set $frontendService AppExit Default Restart
& $nssm set $frontendService AppRestartDelay 5000

& $nssm start $backendService
& $nssm start $frontendService

Get-Service -Name $backendService, $frontendService | Select-Object Name, Status, StartType