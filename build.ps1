# build.ps1 — builds EditPrompt.exe from source
# Run this from PowerShell inside the project folder: .\build.ps1
# Requires: Node.js >= 22.5 and `npm install` already done once.

$ErrorActionPreference = "Stop"

Write-Host "== 1/5: Installing build tools (esbuild, postject, rcedit) ==" -ForegroundColor Cyan
npm install --no-save esbuild postject rcedit

Write-Host "== 2/5: Bundling desktop-entry.js -> bundled.js ==" -ForegroundColor Cyan
# Node's Single Executable Applications always run the injected blob as
# CommonJS (regardless of "type":"module" in package.json), so we bundle to
# CJS here even though the source files use ESM import/export.
npx esbuild desktop-entry.js `
  --bundle `
  --platform=node `
  --format=cjs `
  --outfile=bundled.js `
  --external:node:sqlite

Write-Host "== 3/5: Generating SEA blob ==" -ForegroundColor Cyan
node --experimental-sea-config sea-config.json

Write-Host "== 4/5: Copying node.exe -> EditPrompt.exe and embedding icon ==" -ForegroundColor Cyan
$nodePath = (Get-Command node).Source
Copy-Item $nodePath "EditPrompt.exe" -Force

$rcedit = "node_modules\rcedit\bin\rcedit-x64.exe"
& $rcedit "EditPrompt.exe" `
  --set-icon "build-assets\icon.ico" `
  --set-version-string "ProductName" "EditPrompt" `
  --set-version-string "FileDescription" "EditPrompt Desktop" `
  --set-version-string "CompanyName" "EditPrompt" `
  --set-file-version "6.0.0.0" `
  --set-product-version "6.0.0.0"

Write-Host "== 5/5: Injecting app code into EditPrompt.exe ==" -ForegroundColor Cyan
npx postject "EditPrompt.exe" NODE_SEA_BLOB "sea-prep.blob" `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 `
  --overwrite

Write-Host ""
Write-Host "Done. EditPrompt.exe is ready in this folder." -ForegroundColor Green
Write-Host "It needs 'public/', 'downloads/', '.env' and 'editprompt.db' next to it to run." -ForegroundColor Yellow
