param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$changedPosts = git status --porcelain -- _posts _drafts assets/images |
  ForEach-Object { $_.Substring(3).Trim('"') } |
  Where-Object { $_ }

if (-not $changedPosts) {
  Write-Host "No changed blog content."
  exit 0
}

Write-Host "Changed blog content:"
$changedPosts | ForEach-Object { Write-Host " - $_" }

git add -- _posts _drafts assets/images

if (-not $Message) {
  $firstPost = $changedPosts | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  $titleLine = $null

  if ($firstPost) {
    $titleLine = Select-String -Path $firstPost -Pattern '^title:\s*(.+)$' -Encoding UTF8 | Select-Object -First 1
  }

  if ($titleLine) {
    $title = $titleLine.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
    $Message = "Publish post: $title"
  } else {
    $Message = "Publish blog changes"
  }
}

git commit -m $Message
git push origin main

Write-Host ""
Write-Host "Published posts."
Write-Host "Commit: $Message"
Write-Host "GitHub Pages will rebuild automatically."
