param(
  [Parameter(Mandatory = $true)][string]$ServerUrl,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$DeviceName = $env:COMPUTERNAME,
  [int]$IntervalSec = 8
)

function Get-CpuPercent {
  $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
  return [math]::Round($cpu.Average, 1)
}

function Get-MemoryPercent {
  $os = Get-CimInstance Win32_OperatingSystem
  $total = [double]$os.TotalVisibleMemorySize
  $free = [double]$os.FreePhysicalMemory
  if ($total -le 0) { return 0 }
  return [math]::Round((($total - $free) / $total) * 100, 1)
}

function Get-DiskPercent {
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Sort-Object Size -Descending | Select-Object -First 1
  if (-not $disk -or $disk.Size -le 0) { return 0 }
  return [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
}

function Get-NetworkMbps {
  $rows = @(Get-NetAdapterStatistics)
  $rx = ($rows | Measure-Object -Property ReceivedBytes -Sum).Sum
  $tx = ($rows | Measure-Object -Property SentBytes -Sum).Sum
  if (-not $script:PrevNet) {
    $script:PrevNet = @{
      Rx = $rx
      Tx = $tx
      Ts = Get-Date
    }
    return @{ In = 0; Out = 0 }
  }

  $now = Get-Date
  $seconds = [math]::Max(($now - $script:PrevNet.Ts).TotalSeconds, 1)
  $inMbps = (($rx - $script:PrevNet.Rx) * 8 / 1MB) / $seconds
  $outMbps = (($tx - $script:PrevNet.Tx) * 8 / 1MB) / $seconds

  $script:PrevNet = @{
    Rx = $rx
    Tx = $tx
    Ts = $now
  }

  return @{
    In = [math]::Round($inMbps, 2)
    Out = [math]::Round($outMbps, 2)
  }
}

function Get-Snapshot {
  $cpu = Get-CpuPercent
  $memory = Get-MemoryPercent
  $disk = Get-DiskPercent
  $network = Get-NetworkMbps
  $processes = (Get-Process).Count
  $uptimeHours = [math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 2)
  $temp = [math]::Round([math]::Min(88, 34 + $cpu * 0.35 + $memory * 0.12), 1)

  return @{
    cpu = $cpu
    memory = $memory
    disk = $disk
    networkIn = $network.In
    networkOut = $network.Out
    processes = $processes
    uptimeHours = $uptimeHours
    temperature = $temp
    loadLabel = "PowerShell agent / Windows"
  }
}

function Invoke-AgentLoop {
  while ($true) {
    try {
      $body = @{
        token = $Token
        snapshot = Get-Snapshot
        meta = @{
          host = $DeviceName
          platform = (Get-CimInstance Win32_OperatingSystem).Caption
          location = $DeviceName
          tags = @("powershell-agent", "windows")
        }
      } | ConvertTo-Json -Depth 8

      Invoke-RestMethod -Uri "$ServerUrl/api/ingest" -Method Post -ContentType "application/json" -Body $body | Out-Null

      $commands = Invoke-RestMethod -Uri "$ServerUrl/api/agent/commands?token=$Token" -Method Get
      foreach ($command in $commands.commands) {
        $resultBody = @{
          token = $Token
          commandId = $command.id
          result = @{
            ok = $true
            handledAt = (Get-Date).ToString("o")
            note = "PowerShell agent acknowledged the command."
          }
        } | ConvertTo-Json -Depth 6

        Invoke-RestMethod -Uri "$ServerUrl/api/agent/command-result" -Method Post -ContentType "application/json" -Body $resultBody | Out-Null
      }
    }
    catch {
      Write-Warning $_.Exception.Message
    }

    Start-Sleep -Seconds $IntervalSec
  }
}

Write-Host "Aurora PowerShell agent started for $DeviceName -> $ServerUrl"
Invoke-AgentLoop
