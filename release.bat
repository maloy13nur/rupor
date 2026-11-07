@echo off
setlocal EnableDelayedExpansion

if "%1"=="" (
    echo.
    echo  Usage:   release.bat ^<version^>
    echo  Example: release.bat 0.2.0
    echo.
    pause
    exit /b 1
)

set VER=%1
set TAG=v!VER!

echo.
echo  === Rupor Release !TAG! ===
echo.

echo [1/5] Updating version in package.json and tauri.conf.json...
call npm version !VER! --no-git-tag-version --allow-same-version 2>nul
node -e "const fs=require('fs');const p='src-tauri/tauri.conf.json';let s=fs.readFileSync(p,'utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);s=s.replace(/\"version\":\s*\"[^\"]+\"/,'\"version\": \"!VER!\"');fs.writeFileSync(p,s,'utf8')"
echo    Done.

echo [2/5] Building app...
call npm run tauri build
if !errorlevel! neq 0 (
    echo.
    echo  Build failed! Fix errors and try again.
    pause
    exit /b 1
)
echo    Done.

echo [3/5] Committing version bump...
git add package.json package-lock.json src-tauri\tauri.conf.json
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo    Nothing to commit, skipping.
) else (
    git commit -m "chore: bump version to !VER!"
)

echo [4/5] Creating tag !TAG!...
git tag !TAG! 2>nul || echo    Tag already exists, skipping.

echo [5/5] Pushing to GitHub...
git push origin master
git push origin !TAG!

echo.
echo  Done! GitHub Actions is building the signed release.
echo  Track progress: https://github.com/maloy13nur/rupor/actions
echo.
echo  Local installer ready at:
echo    src-tauri\target\release\bundle\nsis\Rupor_!VER!_x64-setup.exe
echo.
pause
