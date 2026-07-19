$ErrorActionPreference = 'Stop'

$serviceId = 'ThanhHoaiERP8777'
$legacyTaskName = 'Thanh Hoai ERP 8777 - Private'
$appDir = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $appDir 'deployment\winsw\ThanhHoaiERPService.exe'
$config = Join-Path $appDir 'deployment\winsw\ThanhHoaiERPService.xml'
$pythonExe = 'C:\Users\phant\AppData\Local\Programs\Python\Python311\python.exe'
$expectedSha256 = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$healthUrl = 'http://127.0.0.1:8777/api/me'
$runtimeDir = Join-Path $appDir 'reports\runtime'
$resultPath = Join-Path $runtimeDir 'windows-service-install.json'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this installer as Administrator.'
    }
}

function Invoke-WinSW([string]$Command) {
    & $wrapper $Command
    if ($LASTEXITCODE -ne 0) {
        throw "WinSW command '$Command' failed with exit code $LASTEXITCODE."
    }
}

function Wait-AppHealth([int]$TimeoutSeconds = 45) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    } while ((Get-Date) -lt $deadline)
    return $false
}

Assert-Administrator
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $wrapper -PathType Leaf)) {
    throw "WinSW wrapper not found: $wrapper"
}
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "WinSW configuration not found: $config"
}
if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    throw "Python runtime not found: $pythonExe"
}

$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $wrapper).Hash
if ($actualSha256 -ne $expectedSha256) {
    throw "WinSW SHA256 mismatch. Expected $expectedSha256 but found $actualSha256."
}

# Fail before changing service state if the XML is malformed.
[xml](Get-Content -LiteralPath $config -Raw -Encoding UTF8) | Out-Null

# The service runs as the low-privilege built-in LocalService account. Python
# is installed under the interactive user's profile, whose default ACL blocks
# service accounts, so grant read/execute only to the runtime tree.
$pythonRoot = Split-Path -Parent $pythonExe
& "$env:SystemRoot\System32\icacls.exe" $pythonRoot /grant '*S-1-5-19:(OI)(CI)RX' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Unable to grant LocalService read/execute access to $pythonRoot."
}

$existingService = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
if ($null -eq $existingService) {
    Invoke-WinSW 'install'
} else {
    if ($existingService.Status -ne 'Stopped') {
        Invoke-WinSW 'stop'
    }
    # WinSW 2.x has no in-place refresh command. Re-registering is required
    # when the service account or other SCM-level configuration changes.
    Invoke-WinSW 'uninstall'
    Invoke-WinSW 'install'
}

Invoke-WinSW 'start'

if (-not (Wait-AppHealth)) {
    throw "Service started but App 8777 did not become healthy at $healthUrl."
}

# Keep the old task as a disabled rollback artifact. It must not race the
# Windows Service for the same loopback port.
$legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
if ($null -ne $legacyTask) {
    if ($legacyTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $legacyTaskName
    }
    Disable-ScheduledTask -TaskName $legacyTaskName | Out-Null
}

$service = Get-CimInstance Win32_Service -Filter "Name='$serviceId'"
$listener = Get-NetTCPConnection -LocalPort 8777 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1 LocalAddress, LocalPort, OwningProcess

$result = [ordered]@{
    recorded_at = (Get-Date).ToString('o')
    service_name = $serviceId
    service_state = $service.State
    start_mode = $service.StartMode
    process_id = $service.ProcessId
    service_account = $service.StartName
    health_url = $healthUrl
    health_status = 200
    listener_address = $listener.LocalAddress
    listener_port = $listener.LocalPort
    legacy_task_disabled = ($null -ne $legacyTask)
    winsw_sha256 = $actualSha256
}
$result | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
$result | ConvertTo-Json
