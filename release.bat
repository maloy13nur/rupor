@echo off
setlocal EnableDelayedExpansion

if "%1"=="" (
    echo.
    echo  Usage:   release.bat ^<version^>
    echo  Example: release.bat 0.3.0
    echo.
    pause
    exit /b 1
)

:: Strip leading "v" if user passed v0.3.0 instead of 0.3.0
set VER=%1
if /i "!VER:~0,1!"=="v" set VER=!VER:~1!
set TAG=v!VER!

echo.
echo  === Rupor Release !TAG! ===
echo.

:: ---- Step 1: bump versions ----
echo [1/5] Updating version in package.json and tauri.conf.json...
call npm version !VER! --no-git-tag-version --allow-same-version 2>nul
if !errorlevel! neq 0 (
    echo  ERROR: npm version failed.
    pause
    exit /b 1
)
node -e "const fs=require('fs');const p='src-tauri/tauri.conf.json';let s=fs.readFileSync(p,'utf8');if(s.charCodeAt(0)===0xFEFF)s=s.slice(1);s=s.replace(/\"version\":\s*\"[^\"]+\"/,'\"version\": \"!VER!\"');fs.writeFileSync(p,s,'utf8');"
if !errorlevel! neq 0 (
    echo  ERROR: failed to update tauri.conf.json.
    pause
    exit /b 1
)
echo    Done.

:: ---- Step 2: build ----
echo [2/5] Building app (this takes ~10 minutes)...
call npm run tauri build
if !errorlevel! neq 0 (
    echo.
    echo  Build failed! Fix errors and try again.
    pause
    exit /b 1
)
echo    Done.

:: ---- Step 3: commit version bump ----
echo [3/5] Committing version bump...
git add package.json package-lock.json src-tauri\tauri.conf.json
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo    Nothing to commit, skipping.
) else (
    git commit -m "chore: bump version to !VER!"
    if !errorlevel! neq 0 (
        echo  ERROR: git commit failed.
        pause
        exit /b 1
    )
)

:: ---- Step 4: tag ----
echo [4/5] Creating tag !TAG!...
git tag !TAG! 2>nul
if !errorlevel! neq 0 (
    echo    Tag !TAG! already exists locally, reusing.
)

:: ---- Step 5: push ----
echo [5/5] Pushing to GitHub...
git push origin master
if !errorlevel! neq 0 (
    echo  ERROR: git push master failed. Check your connection and credentials.
    pause
    exit /b 1
)
git push origin !TAG!
if !errorlevel! neq 0 (
    echo  ERROR: git push tag !TAG! failed.
    echo  Try:  git push origin :refs/tags/!TAG!  then run release.bat again.
    pause
    exit /b 1
)

echo.
echo  Done! GitHub Actions is building the signed release.
echo  Track progress: https://github.com/maloy13nur/rupor/actions
echo.
echo  Local installer ready at:
echo    src-tauri\target\release\bundle\nsis\Rupor_!VER!_x64-setup.exe
echo.
pause
