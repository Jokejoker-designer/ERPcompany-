$ErrorActionPreference = 'Stop'

$serviceId = 'ThanhHoaiERP8777'
$appDir = Split-Path -Parent $PSScriptRoot
$healthUrls = @(
    'http://127.0.0.1:8777/api/me',
    'https://thanh-hoai-erp.tail3ccd9a.ts.net/api/me'
)
$backendFiles = @('server.py', 'api.py', 'api_write.py') |
    ForEach-Object { Get-Item -LiteralPath (Join-Path $appDir $_) }
$latestBackendWrite = ($backendFiles | Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).LastWriteTime

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this restart script as Administrator.'
}

$service = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
if ($null -eq $service) {
    throw "Windows Service is not installed: $serviceId"
}

Restart-Service -Name $serviceId -Force

$deadline = (Get-Date).AddSeconds(45)
$localStatus = -1
do {
    try {
        $localStatus = (Invoke-WebRequest -UseBasicParsing -Uri $healthUrls[0] -TimeoutSec 3).StatusCode
    } catch {
        Start-Sleep -Seconds 1
    }
} while ($localStatus -ne 200 -and (Get-Date) -lt $deadline)

if ($localStatus -ne 200) {
    throw 'App 8777 did not become healthy within 45 seconds.'
}

$listener = Get-NetTCPConnection -LocalPort 8777 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $listener -or $listener.LocalAddress -ne '127.0.0.1') {
    throw 'App 8777 is not listening exclusively on the expected loopback address.'
}

$origin = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($origin.CreationDate -lt $latestBackendWrite) {
    throw 'The listener process is older than the latest backend source file.'
}

$remoteStatus = -1
try {
    $remoteStatus = (Invoke-WebRequest -UseBasicParsing -Uri $healthUrls[1] -TimeoutSec 15).StatusCode
} catch {
    # Local health is authoritative for the service restart. Preserve remote
    # status as evidence so a Tailscale-specific failure remains visible.
}

[ordered]@{
    service_name = $serviceId
    service_state = (Get-Service -Name $serviceId).Status.ToString()
    origin_pid = $listener.OwningProcess
    origin_started = $origin.CreationDate.ToString('o')
    latest_backend_write = $latestBackendWrite.ToString('o')
    listener_address = $listener.LocalAddress
    local_health = $localStatus
    tailscale_health = $remoteStatus
} | ConvertTo-Json

