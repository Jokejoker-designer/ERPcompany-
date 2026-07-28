param(
    [switch]$EnableLegacyTask
)

$ErrorActionPreference = 'Stop'

$serviceId = 'ThanhHoaiERP8777'
$legacyTaskName = 'Thanh Hoai ERP 8777 - Private'
$appDir = Split-Path -Parent $PSScriptRoot
$wrapper = Join-Path $appDir 'deployment\winsw\ThanhHoaiERPService.exe'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this remover as Administrator.'
}

$service = Get-Service -Name $serviceId -ErrorAction SilentlyContinue
if ($null -ne $service) {
    if ($service.Status -ne 'Stopped') {
        & $wrapper stop
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to stop $serviceId (exit code $LASTEXITCODE)."
        }
    }
    & $wrapper uninstall
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to uninstall $serviceId (exit code $LASTEXITCODE)."
    }
}

if ($EnableLegacyTask) {
    $legacyTask = Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    if ($null -ne $legacyTask) {
        Enable-ScheduledTask -TaskName $legacyTaskName | Out-Null
    }
}

Write-Output "Removed Windows Service: $serviceId"
if ($EnableLegacyTask) {
    Write-Output "Re-enabled legacy scheduled task when present: $legacyTaskName"
}
