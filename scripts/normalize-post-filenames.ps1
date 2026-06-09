param(
  [switch]$All,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
. "$PSScriptRoot\post-slug.ps1"

if ($All) {
  $posts = Get-ChildItem -Path "_posts" -File
} else {
  $posts = git status --porcelain -- _posts |
    Where-Object { $_.Substring(0, 2) -eq "??" } |
    ForEach-Object { $_.Substring(3).Trim('"') } |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Get-Item $_ }
}

foreach ($post in $posts) {
  $content = Get-Content -Raw -Encoding UTF8 $post.FullName
  $dateMatch = [regex]::Match($post.Name, "^(\d{4}-\d{2}-\d{2})")

  if ($dateMatch.Success) {
    $date = $dateMatch.Groups[1].Value
  } else {
    $date = Get-Date -Format "yyyy-MM-dd"
  }

  $slug = Convert-ToPostSlug -Content $content -Fallback "post"
  $targetName = "$date-$slug.md"

  if ($post.Name -eq $targetName) {
    continue
  }

  $targetPath = Join-Path $post.DirectoryName $targetName
  $i = 2
  while ((Test-Path $targetPath) -and ((Resolve-Path $targetPath).Path -ne $post.FullName)) {
    $targetName = "$date-$slug-$i.md"
    $targetPath = Join-Path $post.DirectoryName $targetName
    $i++
  }

  Write-Host "Rename $($post.Name) -> $targetName"

  if (-not $WhatIfOnly) {
    Move-Item -LiteralPath $post.FullName -Destination $targetPath
  }
}
