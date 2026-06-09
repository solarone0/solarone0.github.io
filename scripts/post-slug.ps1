function Get-FrontMatterValue {
  param(
    [string]$Content,
    [string]$Key
  )

  $pattern = "(?m)^$([regex]::Escape($Key)):\s*(.+?)\s*$"
  $match = [regex]::Match($Content, $pattern)
  if (-not $match.Success) {
    return ""
  }

  return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Convert-HangulToRoman {
  param([string]$Text)

  $initial = @("g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h")
  $vowel = @("a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i")
  $final = @("","k","k","ks","n","nj","nh","t","l","lk","lm","lb","ls","lt","lp","lh","m","p","ps","t","t","ng","t","t","k","t","p","t")

  $out = New-Object System.Text.StringBuilder

  foreach ($ch in $Text.ToCharArray()) {
    $code = [int][char]$ch

    if ($code -ge 0xAC00 -and $code -le 0xD7A3) {
      $offset = $code - 0xAC00
      $i = [math]::Floor($offset / 588)
      $v = [math]::Floor(($offset % 588) / 28)
      $f = $offset % 28
      [void]$out.Append($initial[$i])
      [void]$out.Append($vowel[$v])
      [void]$out.Append($final[$f])
    } elseif (($code -ge 48 -and $code -le 57) -or ($code -ge 65 -and $code -le 90) -or ($code -ge 97 -and $code -le 122)) {
      [void]$out.Append($ch)
    } else {
      [void]$out.Append("-")
    }
  }

  return $out.ToString()
}

function Convert-ToPostSlug {
  param(
    [string]$Content,
    [string]$Fallback = "post"
  )

  $explicitSlug = Get-FrontMatterValue -Content $Content -Key "slug"
  if ($explicitSlug) {
    $source = $explicitSlug
  } else {
    $title = Get-FrontMatterValue -Content $Content -Key "title"

    if (-not $title -or $title -in @("New Post", "Untitled")) {
      $bodyLine = ($Content -split "`r?`n" |
        Where-Object {
          $line = $_.Trim()
          $line -and
          $line -ne "---" -and
          $line -notmatch "^(layout|title|slug|date):" -and
          $line -notmatch "^#"
        } |
        Select-Object -First 1)
      $source = if ($bodyLine) { $bodyLine } else { $Fallback }
    } else {
      $source = $title
    }
  }

  $englishWords = [regex]::Matches($source.ToLowerInvariant(), "[a-z0-9]+") |
    ForEach-Object { $_.Value } |
    Where-Object { $_.Length -gt 1 } |
    Select-Object -First 6

  if ($englishWords) {
    return ($englishWords -join "-")
  }

  $roman = Convert-HangulToRoman -Text $source
  $slug = $roman.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  $slug = $slug.Trim("-")

  if (-not $slug) {
    $slug = $Fallback
  }

  return $slug
}
