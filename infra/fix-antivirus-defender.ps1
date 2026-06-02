<#
.SINOPSE
  Corrige a recorrencia do erro "Cannot find module 'next/dist/...'" no dev do
  frontend. Causa: o Windows Defender (ou outro AV) coloca arquivos do `next`
  dentro de node_modules em quarentena, corrompendo a instalacao do pnpm.

  Este script adiciona exclusoes no Defender para:
    - a pasta do projeto (node_modules incluso)
    - o store global do pnpm (~/.pnpm-store / AppData)
    - o processo node.exe

.COMO USAR (uma vez)
  1. Abra o PowerShell COMO ADMINISTRADOR
     (menu Iniciar > digite "PowerShell" > "Executar como administrador")
  2. Rode:
       Set-ExecutionPolicy -Scope Process Bypass -Force
       & "C:\Users\Renato Junio\Documents\GitHub\Pioneria-Financas\infra\fix-antivirus-defender.ps1"

  Se usar OUTRO antivirus (Kaspersky, McAfee, Avast...), adicione as mesmas
  pastas manualmente nas exclusoes desse AV — o Defender pode estar desativado.
#>

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Rode este script em um PowerShell ABERTO COMO ADMINISTRADOR."
  exit 1
}

if (-not (Get-Command Add-MpPreference -ErrorAction SilentlyContinue)) {
  Write-Warning "Cmdlets do Windows Defender nao encontrados. Voce provavelmente usa outro antivirus."
  Write-Warning "Adicione manualmente estas pastas nas exclusoes do seu AV:"
  Write-Host "  - $PSScriptRoot\.."
  Write-Host "  - $env:LOCALAPPDATA\pnpm"
  Write-Host "  - $env:USERPROFILE\.pnpm-store"
  exit 0
}

$projeto = (Resolve-Path "$PSScriptRoot\..").Path
$paths = @(
  $projeto,
  "$env:LOCALAPPDATA\pnpm",
  "$env:LOCALAPPDATA\pnpm-store",
  "$env:USERPROFILE\.pnpm-store"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

foreach ($p in $paths) {
  try {
    Add-MpPreference -ExclusionPath $p -ErrorAction Stop
    Write-Host "[ok] pasta excluida: $p" -ForegroundColor Green
  } catch {
    Write-Warning "[falhou] $p : $($_.Exception.Message)"
  }
}

# Excluir o processo node (cobre qualquer caminho de instalacao do Node).
try {
  Add-MpPreference -ExclusionProcess 'node.exe' -ErrorAction Stop
  Write-Host "[ok] processo excluido: node.exe" -ForegroundColor Green
} catch {
  Write-Warning "[falhou] node.exe : $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Exclusoes atuais (pastas):" -ForegroundColor Cyan
(Get-MpPreference).ExclusionPath
Write-Host ""
Write-Host "Pronto. Rode 'pnpm install --force' uma ultima vez e depois 'pnpm dev'." -ForegroundColor Green
