@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  release.bat  —  bump version and publish a new Rupor release
::  Usage:  release.bat 0.3.0
::  GitHub Actions builds the signed installer automatically.
:: ============================================================

if "%1"=="" (
    echo.
    echo  Usage:   release.bat ^<version^>
    echo  Example: release.bat 0.3.0
    echo.
    pause
    exit /b 1
)

:: Normalize — strip leading v if user typed v0.3.0
set VER=%1
if /i "!VER:~0,1!"=="v" set VER=!VER:~1!
set TAG=v!VER!

echo.
echo  =========================================
echo   Rupor Release !TAG!
echo  =========================================
echo.

:: ---- prereq check -------------------------------------------------------
where git  >nul 2>&1 || ( echo  ERROR: git not found. Install Git for Windows.  & pause & exit /b 1 )
where node >nul 2>&1 || ( echo  ERROR: node not found. Install Node.js.          & pause & exit /b 1 )
where npm  >nul 2>&1 || ( echo  ERROR: npm not found.                            & pause & exit /b 1 )
if not exist "package.json"              ( echo  ERROR: run this from the project root.    & pause & exit /b 1 )
if not exist "src-tauri\tauri.conf.json" ( echo  ERROR: src-tauri\tauri.conf.json missing. & pause & exit /b 1 )

:: ---- [1/4] Bump versions ------------------------------------------------
echo [1/4] Bumping versions to !VER!...

call npm version !VER! --no-git-tag-version --allow-same-version 2>nul
if !errorlevel! neq 0 (
    echo  ERROR: "npm version !VER!" failed. Check that the version is valid semver.
    pause
    exit /b 1
)

node scripts\bump-version.cjs !VER!
if !errorlevel! neq 0 (
    echo  ERROR: failed to patch tauri.conf.json / Cargo.toml.
    pause
    exit /b 1
)

echo    Done  package.json + tauri.conf.json + Cargo.toml =^> !VER!
echo.

:: ---- [2/4] Commit -------------------------------------------------------
echo [2/4] Committing version bump...
git add package.json package-lock.json src-tauri\tauri.conf.json src-tauri\Cargo.toml
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo    Nothing changed — skipping commit.
) else (
    git commit -m "chore: bump version to !VER!"
    if !errorlevel! neq 0 (
        echo  ERROR: git commit failed.
        pause
        exit /b 1
    )
)
echo.

:: ---- [3/4] Tag ----------------------------------------------------------
echo [3/4] Creating tag !TAG!...
git tag !TAG! 2>nul
if !errorlevel! neq 0 (
    echo  ERROR: tag !TAG! already exists locally.
    echo.
    echo  To re-release this version, delete the old tag first:
    echo    git tag -d !TAG!
    echo    git push origin :refs/tags/!TAG!
    echo  Then run release.bat !VER! again.
    pause
    exit /b 1
)
echo    Done.
echo.

:: ---- [4/4] Push ---------------------------------------------------------
echo [4/4] Pushing to GitHub...
git push origin master
if !errorlevel! neq 0 (
    echo  ERROR: push master failed. Check your internet connection and credentials.
    pause
    exit /b 1
)
git push origin !TAG!
if !errorlevel! neq 0 (
    echo  ERROR: push tag !TAG! failed.
    pause
    exit /b 1
)

echo.
echo  =========================================
echo   Done!  GitHub Actions is now building.
echo  =========================================
echo.
echo  Monitor progress:
echo    https://github.com/maloy13nur/rupor/actions
echo.
echo  After CI finishes ^(~10 min^), the new version appears
echo  as an update banner inside the running app.
echo.
pause
