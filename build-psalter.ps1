<#
.SYNOPSIS
    Render psalter.json as a Markdown book with a table of contents,
    grouped into the five traditional books of the Psalter, with one
    "page" (page-break) per psalm covering every version and part.

.PARAMETER InputPath
    Path to the source JSON. Defaults to psalter.json next to this script.

.PARAMETER OutputPath
    Path to the generated Markdown. Defaults to psalter.md next to this script.

.PARAMETER Books
    Array of book definitions: each is a hashtable with Title, First, Last.
    Defaults to the standard 5-book division of the Psalter.
#>
[CmdletBinding()]
param(
    [string]$InputPath  = (Join-Path $PSScriptRoot 'psalter.json'),
    [string]$OutputPath = (Join-Path $PSScriptRoot 'psalter.md'),
    [object[]]$Books = @(
        @{ Title = 'Book I';   First = 1;   Last = 41  },
        @{ Title = 'Book II';  First = 42;  Last = 72  },
        @{ Title = 'Book III'; First = 73;  Last = 89  },
        @{ Title = 'Book IV';  First = 90;  Last = 106 },
        @{ Title = 'Book V';   First = 107; Last = 150 }
    )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "Input file not found: $InputPath"
}

$data = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Group all settings by psalm number; preserve original order within a group.
$groups = $data.settings |
    Group-Object -Property psalm |
    Sort-Object { [int]$_.Name }

$pageBreak = '<div style="page-break-after: always; break-after: page;"></div>'

function Get-Prop {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Format-Stanza {
    param($Stanza)

    $sb = [System.Text.StringBuilder]::new()
    foreach ($line in $Stanza) {
        $text = [string](Get-Prop $line 'text')

        $indent = ''
        while ($text.Length -gt 0 -and $text[0] -eq "`t") {
            $indent += '&nbsp;&nbsp;&nbsp;&nbsp;'
            $text = $text.Substring(1)
        }

        $verse = Get-Prop $line 'verse'
        $prefix = ''
        if ($verse) { $prefix = "<sup>$verse</sup> " }

        # Two trailing spaces force a hard line break inside the blockquote.
        [void]$sb.AppendLine("$indent$prefix$text  ")
    }
    return $sb.ToString().TrimEnd()
}

function Format-Setting {
    param($Setting)

    $sb = [System.Text.StringBuilder]::new()

    $part    = Get-Prop $Setting 'part'
    $heading = Get-Prop $Setting 'heading'
    $version = Get-Prop $Setting 'version'
    $meter   = Get-Prop $Setting 'meter'

    if ($part) {
        $h = "### Part $part"
        if ($heading) { $h += " &mdash; $heading" }
        [void]$sb.AppendLine($h)
        [void]$sb.AppendLine()
    }
    elseif ($version) {
        [void]$sb.AppendLine("### Version $version")
        [void]$sb.AppendLine()
    }

    if ($meter) {
        [void]$sb.AppendLine("*$meter*")
        [void]$sb.AppendLine()
    }

    for ($i = 0; $i -lt $Setting.stanzas.Count; $i++) {
        [void]$sb.AppendLine((Format-Stanza $Setting.stanzas[$i]))
        if ($i -lt $Setting.stanzas.Count - 1) {
            [void]$sb.AppendLine()
        }
    }

    return $sb.ToString().TrimEnd()
}

$out = [System.Text.StringBuilder]::new()

# --- Title & TOC -----------------------------------------------------------
[void]$out.AppendLine('# The Psalter')
[void]$out.AppendLine()
[void]$out.AppendLine('## Table of Contents')
[void]$out.AppendLine()

foreach ($book in $Books) {
    [void]$out.AppendLine("### $($book.Title) (Psalms $($book.First)&ndash;$($book.Last))")
    [void]$out.AppendLine()
    $links = foreach ($g in $groups) {
        $n = [int]$g.Name
        if ($n -lt $book.First -or $n -gt $book.Last) { continue }
        "[Psalm $n](#psalm-$n)"
    }
    [void]$out.AppendLine(($links -join ' | '))
    [void]$out.AppendLine()
}

[void]$out.AppendLine($pageBreak)
[void]$out.AppendLine()

# --- Body ------------------------------------------------------------------
foreach ($book in $Books) {
    [void]$out.AppendLine("# $($book.Title)")
    [void]$out.AppendLine()
    [void]$out.AppendLine("*Psalms $($book.First)&ndash;$($book.Last)*")
    [void]$out.AppendLine()
    [void]$out.AppendLine($pageBreak)
    [void]$out.AppendLine()

    foreach ($g in $groups) {
        $n = [int]$g.Name
        if ($n -lt $book.First -or $n -gt $book.Last) { continue }

        [void]$out.AppendLine("## Psalm $n")
        [void]$out.AppendLine()

        $settings = @($g.Group)
        $inscription = $null
        foreach ($s in $settings) {
            $v = Get-Prop $s 'inscription'
            if ($v) { $inscription = [string]$v; break }
        }
        if ($inscription) {
            [void]$out.AppendLine("*$inscription*")
            [void]$out.AppendLine()
        }

        for ($i = 0; $i -lt $settings.Count; $i++) {
            [void]$out.AppendLine((Format-Setting $settings[$i]))
            [void]$out.AppendLine()
            if ($i -lt $settings.Count - 1) {
                [void]$out.AppendLine('---')
                [void]$out.AppendLine()
            }
        }

        [void]$out.AppendLine('[Back to Top](#the-psalter)')
        [void]$out.AppendLine()
        [void]$out.AppendLine($pageBreak)
        [void]$out.AppendLine()
    }
}

$dir = Split-Path -Parent $OutputPath
if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

Set-Content -LiteralPath $OutputPath -Value $out.ToString() -Encoding UTF8

$psalmCount   = $groups.Count
$settingCount = ($data.settings | Measure-Object).Count
Write-Host "Wrote $OutputPath ($psalmCount psalms, $settingCount settings)."
