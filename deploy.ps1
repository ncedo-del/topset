# deploy.ps1 — keep this file INSIDE C:\Users\Khamera\topset-project and
# run it from there. Deploys straight from this project folder — no
# Downloads copy step, so there's no stale/duplicate file for it to
# accidentally pick up.
#
# Usage (from an Administrator PowerShell, if execution policy blocks it):
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "Deploying from $PSScriptRoot ..." -ForegroundColor Cyan

# Deploys hosting files, firestore.rules, and firestore.indexes in one shot.
firebase deploy --only hosting,firestore:rules,firestore:indexes

Write-Host ""
Write-Host "Deploy finished." -ForegroundColor Green
Write-Host "Before trusting it: open the site in an Incognito window (Ctrl+Shift+N)" -ForegroundColor Yellow
Write-Host "with DevTools Console open (F12) and confirm there are no red errors" -ForegroundColor Yellow
Write-Host "and no script failed to load (Network tab, filter: JS)." -ForegroundColor Yellow
