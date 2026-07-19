$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $PSScriptRoot
$pythonExe = 'C:\Users\phant\AppData\Local\Programs\Python\Python311\python.exe'
$runtimeDir = Join-Path $appDir 'reports\runtime'
$stdoutLog = Join-Path $runtimeDir 'app8777.out.log'
$stderrLog = Join-Path $runtimeDir 'app8777.err.log'
$supervisorLog = Join-Path $runtimeDir 'app8777.supervisor.log'
$healthUrl = 'http://127.0.0.1:8777/api/me'

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    throw "Python runtime not found: $pythonExe"
}

# The origin remains HTTP on loopback.  Tailscale Serve terminates TLS and the
# server marks cookies Secure when the forwarded client protocol is HTTPS.
$env:THANH_HOAI_OPEN_BROWSER = '0'
$env:THANH_HOAI_COOKIE_SECURE = 'auto'
$env:PYTHONUTF8 = '1'

Set-Location -LiteralPath $appDir

function Write-SupervisorLog([string]$Message) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $supervisorLog -Encoding UTF8 -Value "[$timestamp] $Message"
}

function Test-AppHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

Write-SupervisorLog "Supervisor started."

# Keep the scheduled task alive. If another healthy App 8777 instance already
# owns the port, wait for it instead of creating a duplicate. If the managed
# Python process exits, restart it after a short bounded delay.
while ($true) {
    if (Test-AppHealth) {
        Start-Sleep -Seconds 15
        continue
    }

    Write-SupervisorLog "Starting App 8777."
    & $pythonExe -u (Join-Path $appDir 'server.py') 1>> $stdoutLog 2>> $stderrLog
    $exitCode = $LASTEXITCODE
    Write-SupervisorLog "App 8777 exited with code $exitCode; retrying in 10 seconds."
    Start-Sleep -Seconds 10
}
