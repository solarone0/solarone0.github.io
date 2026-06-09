param(
  [string]$Title = "New Post"
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot\post-slug.ps1"

$date = Get-Date -Format "yyyy-MM-dd"
$content = @"
---
layout: post
title: "$Title"
---


"@

$slug = Convert-ToPostSlug -Content $content -Fallback "post"
$path = Join-Path "_posts" "$date-$slug.md"
$i = 2

while (Test-Path $path) {
  $path = Join-Path "_posts" "$date-$slug-$i.md"
  $i++
}

$fullPath = Join-Path $repo $path
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($fullPath, $content, $utf8NoBom)
Write-Host "Created $path"
