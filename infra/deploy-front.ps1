
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Region  = 'us-east-1',
    [string]$AppName = 'pedidos360-front',
    [string]$Branch  = 'main'
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot

function Write-Step($text) { Write-Host "`n=== $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    $text" -ForegroundColor Green }
function Write-Skip($text) { Write-Host "    $text" -ForegroundColor DarkGray }

# el aws cli no soporta el BOM al inicio de un archivo de parametros
function Write-JsonFile {
    param([string]$Name, $Value)
    $path = Join-Path $env:TEMP $Name
    # -InputObject y no la tuberia: la tuberia desarma una lista de un elemento
    [System.IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $Value -Compress -Depth 10))
    return $path
}

Write-Step 'Comprobando AWS CLI y credenciales'
$cuenta = aws sts get-caller-identity --query Account --output text
if (-not $cuenta) { throw 'No hay credenciales activas o caducaron. Recárgalas y reintenta.' }
Write-Ok "Cuenta AWS: $cuenta · Región: $Region"

# react router maneja las rutas en el navegador: cualquier ruta que no sea un
# archivo (/orders, /messaging) tiene que devolver index.html y no un 404
$reglaSpa = @{
    source = '</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>'
    target = '/index.html'
    status = '200'
}

Write-Step 'App de Amplify'
$app = (aws amplify list-apps --region $Region | ConvertFrom-Json).apps |
    Where-Object { $_.name -eq $AppName } | Select-Object -First 1

if (-not $app) {
    if ($PSCmdlet.ShouldProcess($AppName, 'crear app')) {
        $reglas = Write-JsonFile 'p360-reglas.json' @(, $reglaSpa)
        $app = (aws amplify create-app --name $AppName --platform WEB `
            --custom-rules "file://$reglas" --region $Region | ConvertFrom-Json).app
        if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la app $AppName." }
        Write-Ok "creada:      $AppName ($($app.appId))"
    }
} elseif (-not ($app.customRules | Where-Object { $_.target -eq '/index.html' -and $_.status -eq '200' })) {
    if ($PSCmdlet.ShouldProcess($AppName, 'agregar la regla de rutas')) {
        $reglas = Write-JsonFile 'p360-reglas.json' @(, $reglaSpa)
        aws amplify update-app --app-id $app.appId --custom-rules "file://$reglas" --region $Region | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar la app $AppName." }
        Write-Ok "actualizada: $AppName (regla de rutas)"
    }
} else {
    Write-Skip "ya existe: $AppName ($($app.appId))"
}
if (-not $app) { Write-Skip 'sin app todavía, nada más que ensayar'; exit 0 }

$AppId = $app.appId
$Url = "https://$Branch.$($app.defaultDomain)"

Write-Step 'Rama'
$hayRama = (aws amplify list-branches --app-id $AppId --region $Region | ConvertFrom-Json).branches |
    Where-Object { $_.branchName -eq $Branch }
if ($hayRama) {
    Write-Skip "ya existe: $Branch"
} elseif ($PSCmdlet.ShouldProcess($Branch, 'crear rama')) {
    aws amplify create-branch --app-id $AppId --branch-name $Branch --stage PRODUCTION --region $Region | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la rama $Branch." }
    Write-Ok "creada:      $Branch"
}

if (-not $PSCmdlet.ShouldProcess($Url, 'compilar, subir y publicar')) { exit 0 }

# la direccion de retorno del login se fija al compilar: la variable de
# entorno le gana al .env, que sigue con localhost para trabajar en local
Write-Step 'Compilando con la dirección de Amplify'
$env:VITE_AZURE_REDIRECT_URI = $Url
Push-Location $Raiz
try {
    corepack pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Falló el build.' }
} finally {
    Pop-Location
    Remove-Item Env:VITE_AZURE_REDIRECT_URI -ErrorAction SilentlyContinue
}
Write-Ok "redirect del login: $Url"

# el zip se arma a mano: compress-archive de powershell 5.1 puede guardar las
# rutas con \ y amplify, que corre en linux, no encontraria assets/...
Write-Step 'Empaquetando'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$dist = Join-Path $Raiz 'dist'
$zip = Join-Path $env:TEMP 'pedidos360-front.zip'
if (Test-Path $zip) { [System.IO.File]::Delete($zip) }
$archivo = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    Get-ChildItem $dist -Recurse -File | ForEach-Object {
        $ruta = $_.FullName.Substring($dist.Length).TrimStart('\', '/') -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archivo, $_.FullName, $ruta) | Out-Null
    }
} finally {
    $archivo.Dispose()
}
Write-Ok "zip listo: $zip"

Write-Step 'Publicando'
$despliegue = aws amplify create-deployment --app-id $AppId --branch-name $Branch --region $Region | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el despliegue.' }
Invoke-WebRequest -Uri $despliegue.zipUploadUrl -Method Put -InFile $zip -ContentType 'application/zip' -UseBasicParsing | Out-Null
aws amplify start-deployment --app-id $AppId --branch-name $Branch --job-id $despliegue.jobId --region $Region | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo publicar el zip.' }

$estado = ''
for ($i = 0; $i -lt 60; $i++) {
    $estado = aws amplify get-job --app-id $AppId --branch-name $Branch --job-id $despliegue.jobId `
        --region $Region --query 'job.summary.status' --output text
    if ($estado -in @('SUCCEED', 'FAILED', 'CANCELLED')) { break }
    Start-Sleep -Seconds 5
}
if ($estado -ne 'SUCCEED') { throw "El despliegue terminó en $estado." }

Write-Step 'Listo'
Write-Host "    URL: $Url" -ForegroundColor Green
Write-Host "    Esa URL tiene que estar en Entra ID como URI de redirección (SPA)" -ForegroundColor Green
Write-Host "    y en el CORS del API Gateway (script del backend).`n" -ForegroundColor Green

# sin esto el script se queda con el codigo de salida del ultimo comando
exit 0
