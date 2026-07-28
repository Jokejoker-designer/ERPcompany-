$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this installer as Administrator.'
}

$taskName = 'Thanh Hoai ERP 8777 - Private'
$launcher = Join-Path $PSScriptRoot 'start_private_server.ps1'
$powerShellExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $launcher

$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$bootTrigger.Delay = 'PT1M'
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$logonTrigger.Delay = 'PT15S'
# Start the freshly installed task through a scheduler-owned time trigger.
# This keeps the long-running supervisor independent from the installer shell.
$activationTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($bootTrigger, $logonTrigger, $activationTrigger) `
    -Principal $taskPrincipal `
    -Settings $settings `
    -Description 'Supervises Thanh Hoai ERP on loopback port 8777 for private Tailscale Serve access.' `
    -Force | Out-Null

# Keep Task Scheduler operational evidence for future startup incidents.
& "$env:SystemRoot\System32\wevtutil.exe" sl Microsoft-Windows-TaskScheduler/Operational /e:true

Write-Output "Installed scheduled task: $taskName"
