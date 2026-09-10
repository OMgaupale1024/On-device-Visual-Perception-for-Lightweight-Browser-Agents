# Synthetic safe pixels only. Generated PNG is ignored, not committed.
Add-Type -AssemblyName System.Drawing
$fixtureRoot = Join-Path $PSScriptRoot '../.browser-test'
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$ocrBitmap = [System.Drawing.Bitmap]::new(1000,750)
$ocrGraphics = [System.Drawing.Graphics]::FromImage($ocrBitmap)
$ocrFont = [System.Drawing.Font]::new('Arial',28,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
try {
  $ocrGraphics.Clear([System.Drawing.Color]::White)
  $ocrLines = @('Employee Travel Request','Employee Name','Email','Phone','Employee ID','Destination','Bengaluru','Purpose','Conference','Password','Continue')
  for ($lineIndex=0; $lineIndex -lt $ocrLines.Length; $lineIndex++) {
    $ocrGraphics.DrawString($ocrLines[$lineIndex],$ocrFont,[System.Drawing.Brushes]::Black,35,(20+60*$lineIndex))
  }
  for ($maskIndex=0; $maskIndex -lt 5; $maskIndex++) {
    $ocrGraphics.FillRectangle([System.Drawing.Brushes]::Black,550,(80+100*$maskIndex),350,45)
  }
  $ocrBitmap.Save((Join-Path $fixtureRoot 'synthetic.png'),[System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $ocrGraphics.Dispose()
  $ocrFont.Dispose()
  $ocrBitmap.Dispose()
}
