@echo off
rem ============================================================
rem  PHAN MEM CHIEU LCD - Nhay dup chuot vao file nay de chay
rem ============================================================
title Phan mem chieu LCD
cd /d "%~dp0"

rem --- Kiem tra da cai Node.js chua ---
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ==========================================================
  echo   MAY TINH CHUA CAI NODE.JS
  echo  ==========================================================
  echo.
  echo   Buoc 1: Trinh duyet se tu mo trang https://nodejs.org
  echo   Buoc 2: Bam nut mau xanh de tai ve, roi cai dat
  echo           ^(cu bam Next - Next - Install la xong^)
  echo   Buoc 3: Cai xong, nhay dup chuot vao file nay lan nua
  echo.
  start https://nodejs.org
  pause
  exit /b
)

rem --- Lan dau chay: tu dong cai cac thu vien can thiet ---
if not exist node_modules (
  echo.
  echo  Dang chuan bi lan dau, vui long doi 1-2 phut...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  Co loi khi cai dat. Hay kiem tra ket noi mang roi chay lai.
    pause
    exit /b
  )
)

echo.
echo  ==========================================================
echo   DANG KHOI DONG... TRINH DUYET SE TU MO TRANG QUAN TRI
echo.
echo   LUU Y: DUNG DONG CUA SO DEN NAY khi dang trinh chieu.
echo   Dong cua so nay = cac man hinh se ngung phat.
echo.
echo   Neu Windows hoi ve tuong lua ^(Firewall^), hay bam ALLOW
echo   / CHO PHEP de cac man hinh ket noi duoc.
echo  ==========================================================
echo.

rem Mo trang quan tri sau 2 giay (doi server khoi dong xong)
start /b cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
