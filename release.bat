@echo off
setlocal EnableDelayedExpansion

if "%1"=="" (
    echo.
    echo  Использование: release.bat ^<версия^>
    echo  Пример:        release.bat 0.2.0
    echo.
    pause
    exit /b 1
)

set VER=%1
set TAG=v!VER!

echo.
echo  === Rupor Release !TAG! ===
echo.

echo [1/5] Обновляем версии в package.json и tauri.conf.json...
call npm version !VER! --no-git-tag-version --allow-same-version 2>nul
powershell -NoProfile -Command ^
  "(Get-Content 'src-tauri\tauri.conf.json' -Raw) -replace '\"version\":\s*\"[^\"]+\"', '\"version\": \"!VER!\"' | Set-Content 'src-tauri\tauri.conf.json' -Encoding UTF8"
echo    Готово.

echo [2/5] Собираем приложение локально...
call npm run tauri build
if !errorlevel! neq 0 (
    echo.
    echo  Сборка не удалась! Исправь ошибки и попробуй снова.
    pause
    exit /b 1
)
echo    Готово.

echo [3/5] Коммитим изменения версии...
git add package.json package-lock.json src-tauri\tauri.conf.json
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo    Нет изменений — пропускаем коммит.
) else (
    git commit -m "chore: bump version to !VER!"
)

echo [4/5] Создаём тег !TAG!...
git tag !TAG! 2>nul || echo    Тег уже существует — пропускаем.

echo [5/5] Пушим в GitHub...
git push origin master
git push origin !TAG!

echo.
echo  Готово! GitHub Actions собирает официальный релиз со всеми подписями.
echo  Следи за прогрессом: https://github.com/maloy13nur/rupor/actions
echo.
echo  Локальный установщик уже готов:
echo    src-tauri\target\release\bundle\nsis\Rupor_!VER!_x64-setup.exe
echo.
pause
