# tools/licensing/collect_hardware_id.ps1
#
# Запускать НА ХОСТЕ (Windows), НЕ внутри Docker-контейнера — контейнер видит
# виртуальное железо, а не настоящее железо ПК (см. companies/middleware.py).
#
# Снимает второй, более "железный" идентификатор привязки к ПК (в дополнение
# к COMPUTERNAME, который проверяется сам по себе через ${COMPUTERNAME}):
# UUID материнской платы — меняется только при замене самой платы, обычный
# пользователь о нём не знает и случайно не поменяет (в отличие от имени ПК).
#
# Использование:
#   Разово при разворачивании — вывести значение для вписывания в
#   global-admin панель (поле "Разрешённый ID железа"):
#     .\collect_hardware_id.ps1
#
#   На сервере — записать прямо в файл, который читает Django (рядом с
#   docker-compose.yml, куда он примонтирован):
#     .\collect_hardware_id.ps1 -OutFile ..\..\hardware_id.txt

param(
    [string]$OutFile = $null
)

$boardUuid = (Get-CimInstance Win32_ComputerSystemProduct).UUID

if (-not $boardUuid) {
    Write-Error "Не удалось прочитать UUID материнской платы."
    exit 1
}

Write-Host "ID железа этого ПК (вписать в global-admin панель):"
Write-Host $boardUuid

if ($OutFile) {
    $boardUuid | Out-File -FilePath $OutFile -Encoding ascii -NoNewline
    Write-Host "Записано в: $OutFile"
}
