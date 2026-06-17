# install av-helper from github
#
# requires:
#   nodejs installed
#   nssm.exe in the PATH
#
# usage:
#   .\install.ps1
#   .\install.ps1 -Version latest
#   .\install.ps1 -Version v1.2.3

param(
    [string]$Version = "latest"
)

### CONFIG #############################################################

$User = "yapweiliang"
$Repo = "OBS-AV-helper"
$ServiceName = "av-helper"
$InstallationZipFilename = "av-helper.zip"

$InstallDir = "$env:USERPROFILE\OneDrive\av-shared\av-helper"
$InstallDir = "$env:USERPROFILE\OneDrive\dcc.computer av-shared\av-helper"

$ReadmeUrl = "https://github.com/$User/$Repo/blob/main/README.md"

### Helper functions

function Confirm-Step($Text)
{
    Write-Host ""
    Write-Host "===================================================="
    Write-Host $Text
    Write-Host "===================================================="

    $answer = Read-Host "Continue? (Y/N)"

    if ($answer.ToUpper() -ne "Y")
    {
        Write-Host "Cancelled."
        exit
    }
}

function Get-LatestReleaseInfo {
    $apiUrl = "https://api.github.com/repos/$User/$Repo/releases/latest"

    return Invoke-RestMethod `
        -Uri $apiUrl `
        -Headers @{ "User-Agent" = "AV-Helper-Installer" }

}

########################################################################

Write-Host ""
Write-Host "OBS AV Helper Installer/Updater"
Write-Host "----------------------------------------"
Write-Host "Prerequisites"
Write-Host "- nodejs is installed"
Write-Host "- nssm.exe is in the PATH or current folder"
Write-Host ""
Write-Host "for specific release, run"
Write-Host "  .\$($MyInvocation.MyCommand.Name) -Version v1.2.3"
Write-Host ""

if ($Version -eq "latest") {
    $releaseInfo = Get-LatestReleaseInfo
    $Version = $releaseInfo.tag_name

    $asset = $releaseInfo.assets | Where-Object { $_.name -eq $InstallationZipFilename } | Select-Object -First 1

    if (-not $asset) {
        Write-Host "ERROR: Could not find $InstallationZipFilename in latest release"
        exit 1
    }

    $ZipUrl = $asset.browser_download_url
}
else {
    $ZipUrl = "https://github.com/$User/$Repo/releases/download/$Version/$InstallationZipFilename"
}

$tempFile = New-TemporaryFile
$tempRoot = Join-Path $tempFile.DirectoryName $tempFile.BaseName

Remove-Item $tempFile -Force

New-Item -ItemType Directory -Path $tempRoot | Out-Null

$tempZip = Join-Path $tempRoot $InstallationZipFilename
$tempExtract = Join-Path $tempRoot "extract"

New-Item -ItemType Directory -Path $tempExtract | Out-Null

##### 0 SHOW VERSION INFO

Write-Host "----------------------------------------"
Write-Host "Target version : $Version"
Write-Host "Download URL   : $ZipUrl"
Write-Host "Install path   : $InstallDir"
Write-Host ""

$go = Read-Host "Continue? (Y/N)"
if ($go.ToUpper() -ne "Y") { exit }

##### 1 DOWNLOAD

Confirm-Step "1. Download release"

Invoke-WebRequest -Uri $ZipUrl -OutFile $tempZip

##### 2 EXTRACT

Confirm-Step "2. Extract release"

Expand-Archive -LiteralPath $tempZip -DestinationPath $tempExtract -Force

##### 3 CONFIG PRESERVATION

Confirm-Step "3. Preserve configuration"

if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

$existingConfig = Join-Path $InstallDir "config.js"

if (Test-Path $existingConfig)
{
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"

    Copy-Item `
        $existingConfig `
        (Join-Path $InstallDir "config.previous.$timestamp.js")
}

$newConfig = Join-Path $tempExtract "config.js"

if (Test-Path $newConfig -and (Test-Path $existingConfig))
{
    Rename-Item $newConfig "config.new.js"
}

##### 4 COPY FILES

Confirm-Step "4. Stop service then copy files to installation"

nssm stop $ServiceName 2>$null
Copy-Item "$tempExtract\*" $InstallDir -Recurse -Force

##### 5 NPM INSTALL

Confirm-Step "5. Install Node dependencies"

Push-Location $InstallDir
npm install
Pop-Location

##### 6 NSSM SERVICE

Confirm-Step "6. Configure Windows service"

nssm remove $ServiceName confirm 2>$null
nssm install $ServiceName "C:\Program Files\nodejs\node.exe" (Join-Path $InstallDir "server.js")
nssm set $ServiceName AppDirectory $InstallDir

##### 7 START SERVICE

Confirm-Step "7. Start service"

nssm start $ServiceName

##### 8 README

$open = Read-Host "Open README in browser? (Y/N)"

if ($open.ToUpper() -eq "Y")
{
    Start-Process $ReadmeUrl
}

########################################################################

Write-Host ""
Write-Host "========================================"
Write-Host "INSTALL COMPLETE"
Write-Host "Version: $Version"
Write-Host "Location: $InstallDir"
Write-Host "========================================"

########################################################################