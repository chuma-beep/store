# Logic test for Make-room-for-Omarchy.ps1 on Linux PowerShell: every Windows storage
# command is replaced by a fake that returns a scripted computer. Nothing real is touched.
param([string]$Script = "$PSScriptRoot/../windows-helper/Make-room-for-Omarchy.ps1")
$env:OMARCHY_NO_PAUSE = '1'
$env:SystemDrive = 'C:'
$GB = 1GB
$results = @()

function PCwith($over) { $h = @{}; foreach ($k in $script:normal.Keys) { $h[$k] = $script:normal[$k] }; foreach ($k in $over.Keys) { $h[$k] = $over[$k] }; $h }
function Run-Case($name, $pc, $argsList, $expectExit, $expectText, [string[]]$forbid = @()) {
  $global:PC = $pc; $global:CALLS = @()
  $prelude = {
    function global:Get-Volume { param($DriveLetter) [pscustomobject]@{ FileSystem = $global:PC.fs; Size = $global:PC.part; SizeRemaining = $global:PC.free } }
    function global:Get-Partition { param($DriveLetter) process { } end { if ($DriveLetter) { [pscustomobject]@{ DiskNumber = 0; Size = $global:PC.part } } else { $global:PC.parts | % { [pscustomobject]@{ Size = $_ } } } } }
    function global:Get-Disk { param($Number) [pscustomobject]@{ PartitionStyle = $global:PC.style; Size = $global:PC.disk } }
    function global:Get-BitLockerVolume { param($MountPoint) if ($global:PC.bitlocker) { [pscustomobject]@{ ProtectionStatus = 'On'; VolumeStatus = 'FullyEncrypted' } } else { [pscustomobject]@{ ProtectionStatus = 'Off'; VolumeStatus = 'FullyDecrypted' } } }
    function global:Get-PartitionSupportedSize { param($DriveLetter) [pscustomobject]@{ SizeMin = $global:PC.min; SizeMax = $global:PC.part } }
    function global:Checkpoint-Computer { param($Description, $RestorePointType) $global:CALLS += "restore:$Description" }
    function global:Resize-Partition { param($DriveLetter, $Size) $global:CALLS += "resize:$([math]::Round(($global:PC.part - $Size)/1GB))" }
    function global:New-Item { param($Path, [switch]$Force) $global:CALLS += "regkey" }
    function global:Set-ItemProperty { param($Path, $Name, $Value, $Type) $global:CALLS += "set:$Name=$Value" }
    function global:Clear-Host { }
    function global:Read-Host { param($p) $global:ANSWERS.Dequeue() }
    function global:exit { param($c) throw "EXIT:$c" }
  }
  . $prelude
  $global:ANSWERS = [System.Collections.Queue]::new(); foreach ($a in $pc.answers) { $global:ANSWERS.Enqueue($a) }
  # Admin check: pretend we're admin by rewriting that one line.
  $src = (Get-Content $Script -Raw) -replace '\$isAdmin = \(\[Security\.Principal[^\r\n]+', ('$isAdmin = $' + ($pc.admin -ne $false).ToString().ToLower())
  $src = $src -replace '(?m)^\s*exit (\d+)', 'throw "EXIT:$1"' -replace '\$Host\.UI\.RawUI\.WindowTitle = [^\r\n]+', ''
  $code = 0; $buf = [System.Collections.Generic.List[object]]::new()
  try { & ([scriptblock]::Create($src)) @argsList *>&1 | ForEach-Object { $buf.Add($_) } }
  catch { if ($_.Exception.Message -match '^EXIT:(\d+)') { $code = [int]$Matches[1] } else { $buf.Add("ERROR: $($_.Exception.Message) $($_.ScriptStackTrace)"); $code = 99 } }
  $out = ($buf | Out-String)
  $ok = ($code -eq $expectExit)
  foreach ($t in $expectText) { if (($out + ($global:CALLS -join ' ')) -notmatch [regex]::Escape($t)) { $ok = $false; Write-Host "   missing: $t" } }
  foreach ($t in $forbid) { if (($global:CALLS -join ' ') -match [regex]::Escape($t)) { $ok = $false; Write-Host "   should not happen: $t" } }
  if (-not $ok) { Write-Host $out; Write-Host "   calls: $($global:CALLS -join ', ') exit=$code" }
  Write-Host ("  {0}  {1}" -f ($(if ($ok) { 'ok  ' } else { 'FAIL' })), $name)
  $script:results += $ok
}

$script:normal = @{ fs = 'NTFS'; style = 'GPT'; bitlocker = $false; part = 476 * $GB; free = 300 * $GB; min = 120 * $GB; disk = 477 * $GB; parts = @((0.1 * $GB), (476 * $GB), (0.7 * $GB)) }

Run-Case 'not admin: refused, nothing changed' (PCwith @{ admin = $false; answers = @() }) @() 1 @('administrator') @('resize')
Run-Case 'BitLocker on: refused with how to turn it off' (PCwith @{ bitlocker = $true; answers = @() }) @() 1 @('Device encryption') @('resize', 'restore')
Run-Case 'old MBR drive: refused' (PCwith @{ style = 'MBR'; answers = @() }) @() 1 @('GPT') @('resize')
Run-Case 'not NTFS: refused' (PCwith @{ fs = 'ReFS'; answers = @() }) @() 1 @('NTFS') @('resize')
Run-Case 'too little free space: refused' (PCwith @{ free = 50 * $GB; answers = @() }) @() 1 @('Omarchy needs at least') @('resize')
Run-Case 'test mode (-WhatIf): explains, changes nothing' (PCwith @{ answers = @('2') }) @{ WhatIf = $true } 0 @('Test mode', '100 GB') @('resize', 'restore', 'set:')
Run-Case 'pick 100 GB but no YES: nothing changed' (PCwith @{ answers = @('2', 'no') }) @() 1 @("didn't type YES") @('resize')
Run-Case 'quit at the menu: nothing changed' (PCwith @{ answers = @('q') }) @() 1 @('quit') @('resize')
Run-Case 'pick 100 GB + YES: restore point, shrink 100, Fast Startup off' (PCwith @{ answers = @('2', 'YES') }) @() 0 @('restore:Before Omarchy', 'resize:100', 'set:HiberbootEnabled=0')
Run-Case 'custom 75 GB' (PCwith @{ answers = @('4', '75', 'YES') }) @() 0 @('resize:75')
Run-Case 'custom size too big: refused' (PCwith @{ answers = @('4', '5000') }) @() 1 @("isn't possible") @('resize')
Run-Case '-SizeGB 200 -Yes: no questions' (PCwith @{ answers = @() }) @{ SizeGB = 200; Yes = $true } 0 @('resize:200')
Run-Case 'only 120 GB free: 200 GB not offered, keeps 20 GB for Windows' (PCwith @{ free = 120 * $GB; answers = @('4', '110') }) @() 1 @('up to 100 GB') @('resize')
Run-Case 'already has empty space: says so' (PCwith @{ disk = 600 * $GB; answers = @('q') }) @() 1 @('already has')

$f = ($results | ? { -not $_ }).Count
Write-Host ''; if ($f) { Write-Host "$f case(s) failed."; exit 1 } else { Write-Host 'All Windows-helper logic checks passed.' }
