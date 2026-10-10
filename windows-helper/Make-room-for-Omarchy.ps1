# Make room for Omarchy  (part of Ignite for Omarchy · omarchystore.com/ignite/)
#
# Frees up space on your Windows drive so Omarchy can be installed NEXT TO Windows
# (Omarchy installer -> "Free space install"). It never deletes anything.
#
# What it does, in order:
#   1. Checks: Windows drive is NTFS, BitLocker is off, enough free space, the drive is GPT/UEFI.
#   2. Makes a Windows restore point (if System Protection is on).
#   3. Asks how much room to make (50 / 100 / 200 GB or your own number).
#   4. Shrinks your C: drive by that amount with Windows' own tool (the same as
#      Disk Management -> Shrink Volume). The freed space is left EMPTY for Omarchy.
#   5. Turns off Fast Startup, so Windows always shuts down fully (needed for dual boot).
#
# Run it: right-click "Make-room-for-Omarchy.cmd" -> Run as administrator.
# Test without changing anything:  powershell -ExecutionPolicy Bypass -File Make-room-for-Omarchy.ps1 -WhatIf

[CmdletBinding()]
param(
  [int]$SizeGB = 0,          # skip the question (e.g. -SizeGB 100)
  [switch]$WhatIf,           # check and explain everything, change nothing
  [switch]$Yes               # don't ask for the final confirmation
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Make room for Omarchy'
$MinOmarchyGB = 40           # Omarchy needs at least this
$KeepFreeGB   = 20           # always leave Windows this much free space

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Title($text) { Write-Host ''; Write-Host "  $text" -ForegroundColor Cyan; Write-Host ('  ' + ('-' * $text.Length)) -ForegroundColor DarkCyan }
function Stop-Here($why, $fix) {
  Write-Host ''
  Say "  Nothing was changed." 'Yellow'
  Say "  Why: $why" 'Yellow'
  if ($fix) { Say "  Fix: $fix" 'White' }
  Write-Host ''
  if (-not $env:OMARCHY_NO_PAUSE) { Read-Host '  Press Enter to close' | Out-Null }
  exit 1
}

Clear-Host
Write-Host ''
Write-Host '   IGNITE  ' -ForegroundColor Black -BackgroundColor DarkMagenta -NoNewline
Write-Host '  Make room for Omarchy' -ForegroundColor White
Say '  Frees space on your Windows drive so Omarchy can live next to Windows.'
Say '  Nothing is deleted. Your files and Windows stay exactly where they are.'
if ($WhatIf) { Say '  TEST MODE: everything is checked, nothing is changed.' 'Magenta' }

# ---------------------------------------------------------------- admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Stop-Here 'this needs administrator rights to change the drive.' 'right-click Make-room-for-Omarchy.cmd and choose "Run as administrator".'
}

# ---------------------------------------------------------------- checks
Title 'Step 1 of 4: Checking your computer'
$letter = $env:SystemDrive.TrimEnd(':')
$vol  = Get-Volume -DriveLetter $letter
$part = Get-Partition -DriveLetter $letter
$disk = Get-Disk -Number $part.DiskNumber

Say ("  Windows drive: {0}:  {1:N0} GB, {2:N0} GB free" -f $letter, ($vol.Size / 1GB), ($vol.SizeRemaining / 1GB))

if ($vol.FileSystem -ne 'NTFS') { Stop-Here "your Windows drive uses $($vol.FileSystem), not NTFS." $null }
if ($disk.PartitionStyle -ne 'GPT') {
  Stop-Here 'your drive uses the old MBR layout. Omarchy needs a GPT drive (a UEFI computer).' 'this computer probably boots in "Legacy/CSM" mode; Omarchy needs UEFI.'
}
Say '  OK  Drive layout is GPT (UEFI)' 'Green'

# BitLocker / Device Encryption
$bl = $null
try { $bl = Get-BitLockerVolume -MountPoint "$($letter):" -ErrorAction Stop } catch { }
if ($bl -and ($bl.ProtectionStatus -eq 'On' -or $bl.VolumeStatus -ne 'FullyDecrypted')) {
  Stop-Here 'BitLocker / Device encryption is on. Omarchy''s "Free space install" can''t work next to an encrypted drive.' `
    'Settings -> Privacy & security -> Device encryption -> Off (or Control Panel -> BitLocker -> Turn off). Wait until it finishes decrypting, then run this again.'
}
Say '  OK  BitLocker is off' 'Green'

# How far can Windows shrink?
$sup = Get-PartitionSupportedSize -DriveLetter $letter
$canShrinkGB = [math]::Floor(($part.Size - $sup.SizeMin) / 1GB)
$freeGB      = [math]::Floor($vol.SizeRemaining / 1GB)
$maxGB       = [math]::Max(0, [math]::Min($canShrinkGB, $freeGB - $KeepFreeGB))
Say ("  Windows can safely give up to {0} GB" -f $maxGB)
if ($maxGB -lt $MinOmarchyGB) {
  Stop-Here ("only {0} GB can be freed, and Omarchy needs at least {1} GB." -f $maxGB, $MinOmarchyGB) `
    'free up space (empty the Recycle Bin, Settings -> System -> Storage -> Cleanup recommendations), or move files to another drive, then run this again.'
}

# Already have empty space?
$used = ($disk | Get-Partition | Measure-Object -Property Size -Sum).Sum
$unallocGB = [math]::Floor(($disk.Size - $used) / 1GB)
if ($unallocGB -ge $MinOmarchyGB) {
  Say ("  NOTE  This drive already has {0} GB of empty space. You may not need to shrink at all:" -f $unallocGB) 'Yellow'
  Say  '        Omarchy''s installer can use it as it is (choose "Free space install").' 'Yellow'
}

# ---------------------------------------------------------------- size
Title 'Step 2 of 4: How much room for Omarchy?'
if ($SizeGB -le 0) {
  $choices = @(50, 100, 200) | Where-Object { $_ -le $maxGB }
  $i = 1
  foreach ($c in $choices) {
    $tag = if ($c -eq 100) { '  (recommended)' } elseif ($c -eq 50) { '  (enough to try it out)' } else { '  (lots of apps and games)' }
    Say ("   [{0}]  {1} GB{2}" -f $i, $c, $tag) 'White'; $i++
  }
  Say ("   [{0}]  Another amount ({1} to {2} GB)" -f $i, $MinOmarchyGB, $maxGB) 'White'
  Say  '   [Q]  Quit without changing anything' 'White'
  $a = Read-Host '  Your choice'
  if ($a -match '^[qQ]') { Stop-Here 'you chose to quit.' $null }
  if ($a -match '^\d+$' -and [int]$a -ge 1 -and [int]$a -le $choices.Count) { $SizeGB = $choices[[int]$a - 1] }
  else {
    $n = Read-Host ("  How many GB? ({0}-{1})" -f $MinOmarchyGB, $maxGB)
    if ($n -notmatch '^\d+$') { Stop-Here 'that isn''t a number.' $null }
    $SizeGB = [int]$n
  }
}
if ($SizeGB -lt $MinOmarchyGB -or $SizeGB -gt $maxGB) {
  Stop-Here ("{0} GB isn't possible here (choose {1} to {2} GB)." -f $SizeGB, $MinOmarchyGB, $maxGB) $null
}
$newSize = $part.Size - [int64]$SizeGB * 1GB
Say ("  Omarchy gets {0} GB.  Windows (C:) goes from {1:N0} GB to {2:N0} GB." -f $SizeGB, ($part.Size / 1GB), ($newSize / 1GB)) 'White'

if ($WhatIf) {
  Title 'Test mode: this is what would happen'
  Say '  - A restore point named "Before Omarchy" would be made'
  Say ("  - C: would shrink by {0} GB, leaving that space empty for Omarchy" -f $SizeGB)
  Say '  - Fast Startup would be turned off'
  Say '  Nothing was changed.' 'Magenta'
  exit 0
}

if (-not $Yes) {
  Write-Host ''
  Say '  Before you go on: shrinking a drive is safe, but back up anything you can''t lose.' 'Yellow'
  $ok = Read-Host '  Type YES to make room for Omarchy'
  if ($ok -ne 'YES') { Stop-Here 'you didn''t type YES.' $null }
}

# ---------------------------------------------------------------- restore point
Title 'Step 3 of 4: Safety restore point'
try {
  Checkpoint-Computer -Description 'Before Omarchy (Ignite)' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
  Say '  OK  Restore point "Before Omarchy (Ignite)" made' 'Green'
} catch {
  Say '  Skipped: Windows didn''t make a restore point (System Protection may be off, or one was made in the last 24 hours).' 'Yellow'
}

# ---------------------------------------------------------------- shrink
Title 'Step 4 of 4: Making room'
Say '  Shrinking C: with Windows'' own tool. This can take a few minutes; don''t turn the computer off.'
try {
  Resize-Partition -DriveLetter $letter -Size $newSize -ErrorAction Stop
} catch {
  Stop-Here ("Windows couldn't shrink the drive: {0}" -f $_.Exception.Message) `
    'files that can''t move (page file, hibernation, System Restore) sit near the end of the drive. Try a smaller size, or turn off hibernation (powercfg /h off) and run this again.'
}
Say ("  OK  {0} GB of empty space is ready for Omarchy" -f $SizeGB) 'Green'

# Fast Startup leaves Windows half-asleep, which locks the drive for other systems.
try {
  New-Item -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Force | Out-Null
  Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -Value 0 -Type DWord
  Say '  OK  Fast Startup turned off (Windows will now shut down fully)' 'Green'
} catch { Say '  Couldn''t turn off Fast Startup. Turn it off in Control Panel -> Power Options.' 'Yellow' }

# ---------------------------------------------------------------- done
Title 'All done. Next steps'
Say '  1. Plug in your Omarchy USB stick (made with Ignite or Rufus).' 'White'
Say '  2. Restart, open the boot menu (usually F12, F11, F8 or Esc) and pick the USB stick.' 'White'
Say '  3. In the Omarchy installer, pick this drive, then choose  "Free space install".' 'White'
Say '     Do NOT choose the whole-drive option: that would erase Windows.' 'Yellow'
Say '  4. After Omarchy starts, run  limine-scan  in a terminal to add Windows to the boot menu.' 'White'
Write-Host ''
if (-not $env:OMARCHY_NO_PAUSE) { Read-Host '  Press Enter to close' | Out-Null }
