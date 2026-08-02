# tools/restore_dev.ps1
# Восстановление dev-базы (нативный Postgres, НЕ Docker) + backend/media из
# папки бэкапа (см. backup_dev.ps1 — тот же формат, что и на сервере).
#
# ВАЖНО: перед восстановлением остановите всё, что держит соединение с БД
# (manage.py runserver / daphne, локальный docker-compose стек, если он тоже
# запущен) — активные соединения могут помешать pg_restore --clean.
#
# Использование:
#   .\tools\restore_dev.ps1 -BackupDir "C:\erp_backups\2026-08-01_10-00"
#   .\tools\restore_dev.ps1 -BackupDir ... -Force   (без интерактивного подтверждения)

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupDir,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$pgRestore = "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe"
$dbName = "erp_db"
$dbUser = "postgres"
$dbPassword = "novedu112garagoz"
$mediaDir = "$PSScriptRoot\..\backend\media"

$dumpFile = Join-Path $BackupDir "erp_db.dump"
$mediaFile = Join-Path $BackupDir "media.tar.gz"

if (-not (Test-Path $dumpFile)) { throw "Не найден $dumpFile" }
if (-not (Test-Path $mediaFile)) { throw "Не найден $mediaFile" }

if (-not $Force) {
    Write-Host ""
    Write-Host "ВНИМАНИЕ: это ЗАМЕНИТ текущую dev-базу erp_db и backend/media на содержимое '$BackupDir'." -ForegroundColor Yellow
    $confirm = Read-Host "Введите ТОЧНО 'ВОССТАНОВИТЬ' чтобы продолжить"
    if ($confirm -ne "ВОССТАНОВИТЬ") {
        Write-Host "Отменено."
        exit 0
    }
}

Write-Host "Восстанавливаю БД из $dumpFile ..."
$env:PGPASSWORD = $dbPassword
& $pgRestore -h localhost -p 5432 -U $dbUser -d $dbName --clean --if-exists $dumpFile
$restoreExit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD
if ($restoreExit -ne 0) { throw "pg_restore завершился с ошибкой" }

Write-Host "Восстанавливаю media из $mediaFile ..."
if (Test-Path $mediaDir) {
    Remove-Item -Path "$mediaDir\*" -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $mediaDir -Force | Out-Null
}
tar -xzf $mediaFile -C $mediaDir
if ($LASTEXITCODE -ne 0) { throw "распаковка media завершилась с ошибкой" }

Write-Host "Восстановление завершено из: $BackupDir"
