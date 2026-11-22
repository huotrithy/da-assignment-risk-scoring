param([Parameter(Mandatory)][string]$Path)
# Fills in the table of contents (page numbers) of a generated report, so Word does not ask to update fields on open.
# Starts its own hidden Word and quits only that one; a Word the user has open is not touched.
$full = (Resolve-Path $Path).Path
$app = New-Object -ComObject Word.Application
$app.Visible = $false
try {
  $doc = $app.Documents.Open($full, $false, $false)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Save()
  Write-Output ("contents updated: " + $doc.TablesOfContents.Count + " table(s), " + $doc.ComputeStatistics(2) + " pages")
  $doc.Close($false)
} finally { $app.Quit() }
