# Synthetic test artwork only. No browser, screenshot API, user data or network.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$fixtureRoot = Join-Path $PSScriptRoot '../benchmarks/fixtures'
$dataset = Get-Content -LiteralPath (Join-Path $fixtureRoot 'screens.json') -Raw | ConvertFrom-Json
$privateLabels = @('Employee Name','Email','Phone','Employee ID','Password')
$fakeValues = @('Example Tester','fixture@example.invalid','5550101234','EMP1024','fake-secret')
$metadata = @()
foreach ($sample in $dataset.samples) {
    $bitmap = New-Object System.Drawing.Bitmap($sample.width, $sample.height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $font = New-Object System.Drawing.Font('Arial', (24 * $sample.scale), [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $regions = @()
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        for ($i = 0; $i -lt $sample.text.Count; $i++) {
            $x = 42 * $sample.scale
            $y = (28 + 60 * $i) * $sample.scale
            $graphics.DrawString($sample.text[$i], $font, [System.Drawing.Brushes]::Black, $x, $y)
            $privateIndex = [Array]::IndexOf($privateLabels, $sample.text[$i])
            if ($privateIndex -ge 0) {
                $rx = 460 * $sample.scale
                $ry = $y - 2 * $sample.scale
                $rw = 450 * $sample.scale
                $rh = 36 * $sample.scale
                $graphics.FillRectangle([System.Drawing.Brushes]::WhiteSmoke, $rx, $ry, $rw, $rh)
                $graphics.DrawString($fakeValues[$privateIndex], $font, [System.Drawing.Brushes]::Black, $rx + 4, $y)
                $regions += @{ x=$rx; y=$ry; width=$rw; height=$rh }
            }
        }
        $bitmap.Save((Join-Path $fixtureRoot ($sample.id + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
        $metadata += @{ id=$sample.id; sensitiveRegions=$regions }
    } finally { $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
@{ generator='System.Drawing Arial 24px, AntiAliasGridFit'; samples=$metadata } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $fixtureRoot 'rendered.json') -Encoding UTF8
