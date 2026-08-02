# tools/backup_dev.ps1
# Бэкап dev-машины (нативный Postgres на Windows, НЕ Docker — см. CLAUDE.md)
# + backend/media в C:\erp_backups\<дата_время>\ — тот же формат
# (erp_db.dump + media.tar.gz), что и backup.ps1/restore.ps1 на сервере.
# Папку с этим бэкапом можно просто скопировать на сервер и восстановить
# там штатным restore.ps1 — оба конца используют одинаковую структуру.
#
# Использование:
#   .\tools\backup_dev.ps1

$ErrorActionPreference = "Stop"

$pgDump = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
$dbName = "erp_db"
$dbUser = "postgres"
$dbPassword = "novedu112garagoz"
$mediaDir = "$PSScriptRoot\..\backend\media"

$date = Get-Date -Format "yyyy-MM-dd_HH-mm"
$destDir = "C:\erp_backups\$date"
New-Item -ItemType Directory -Path $destDir -Force | Out-Null

Write-Host "Бэкап в $destDir ..."

$env:PGPASSWORD = $dbPassword
& $pgDump -Fc -h localhost -p 5432 -U $dbUser -d $dbName -f "$destDir\erp_db.dump"
$dumpExit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD
if ($dumpExit -ne 0) { throw "pg_dump завершился с ошибкой" }

# ✅ tar.exe встроен в Windows (bsdtar, с Windows 10 1803+) — Docker не нужен,
# это же родная папка media на диске, не именованный том.
tar -czf "$destDir\media.tar.gz" --exclude=CACHE -C "$mediaDir" .
if ($LASTEXITCODE -ne 0) { throw "архивация media завершилась с ошибкой" }

Write-Host "Готово: $destDir"
Write-Host "Скопируйте эту папку на сервер и восстановите там: .\restore.ps1 -BackupName $date"
