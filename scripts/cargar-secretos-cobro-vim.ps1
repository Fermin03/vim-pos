# Carga en Supabase las llaves de Mercado Pago de VIM para el cobro por WhatsApp.
# Pide cada valor sin mostrarlo y lo sube con `supabase secrets set` usando un archivo temporal
# que se borra al terminar. Ninguna función publicada usa estas llaves todavía.
$ErrorActionPreference = 'Stop'
$proyecto = 'pbiaxzvmssjsxdwqrumb'

function Leer([string]$etiqueta) {
  $s = Read-Host -AsSecureString $etiqueta
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

Write-Host 'Pega los valores de la aplicacion "VIM POS Mensualidades" (no se ven al escribir).'
$token = Leer 'Access Token (de prueba o de produccion, segun el modo)'
$secreto = Leer 'Clave secreta (pestana del MISMO modo en Webhooks)'
if (-not $token -or -not $secreto) { throw 'Falto un valor; no se subio nada.' }

$archivo = Join-Path $env:TEMP ("mp-vim-" + [guid]::NewGuid() + ".env")
try {
  [IO.File]::WriteAllText($archivo, "MP_VIM_ACCESS_TOKEN=$token`nMP_VIM_WEBHOOK_SECRET=$secreto`n")
  supabase secrets set --project-ref $proyecto --env-file $archivo
  if ($LASTEXITCODE -ne 0) { throw "supabase secrets set fallo ($LASTEXITCODE)" }
  Write-Host 'Listo: MP_VIM_ACCESS_TOKEN y MP_VIM_WEBHOOK_SECRET cargados.'
} finally {
  Remove-Item $archivo -Force -ErrorAction SilentlyContinue
  $token = $null; $secreto = $null
}
