; SPDX-License-Identifier: GPL-3.0-or-later
; A self-contained bilingual installer; writes its own uninstaller at install
; time, so packaging does not need Wine or execution of an intermediate EXE.
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!include "${BUILD_RESOURCES_DIR}\uninstall-files.nsh"
Name "Azadi Connect"
RequestExecutionLevel admin
InstallDir "$PROGRAMFILES64\Azadi Connect"
InstallDirRegKey HKLM "Software\AzadiConnect" "InstallDir"
; Keep packaging within the pinned builder's four-minute makensis deadline.
; Zlib is faster on shared runners than solid LZMA for the bundled engine.
SetCompressor /SOLID /FINAL zlib
ShowInstDetails show
ShowUninstDetails show
!define MUI_ABORTWARNING
!define MUI_LANGDLL_ALLLANGUAGES
!define MUI_LANGDLL_REGISTRY_ROOT HKLM
!define MUI_LANGDLL_REGISTRY_KEY "Software\AzadiConnect"
!define MUI_LANGDLL_REGISTRY_VALUENAME "InstallerLanguage"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PROJECT_DIR}\LICENSE"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "$(RunApp)"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchAzadi
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(ShowPinOptions)"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION ShowPinOptions
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Farsi"
LangString CloseApp ${LANG_ENGLISH} "Please quit Azadi Connect from its tray menu before installing or uninstalling."
LangString CloseApp ${LANG_FARSI} "لطفاً پیش از نصب یا حذف، آزادی کانکت را از منوی کنار ساعت ویندوز ببندید."
LangString RetryCloseApp ${LANG_ENGLISH} "Azadi Connect is still running. Quit it from its tray menu, then click Retry to continue updating. Closing its window only hides it."
LangString RetryCloseApp ${LANG_FARSI} "آزادی کانکت هنوز در حال اجراست. از منوی کنار ساعت «خروج» را بزنید و سپس Retry را انتخاب کنید تا ارتقا ادامه یابد. بستن پنجره فقط آن را مخفی می‌کند."
LangString RunApp ${LANG_ENGLISH} "Run Azadi Connect"
LangString RunApp ${LANG_FARSI} "اجرای آزادی کانکت"
LangString ShowPinOptions ${LANG_ENGLISH} "Show shortcut to pin to Start or taskbar"
LangString ShowPinOptions ${LANG_FARSI} "نمایش میانبر برای پین به Start یا تسک‌بار"
LangString InstallOrUpdate ${LANG_ENGLISH} "Installing or updating Azadi Connect; existing profile data is preserved."
LangString InstallOrUpdate ${LANG_FARSI} "نصب یا به‌روزرسانی آزادی کانکت؛ پروفایل‌های ذخیره‌شده حفظ می‌شوند."
LangString Windows64 ${LANG_ENGLISH} "Azadi Connect requires 64-bit Windows 10 or later."
LangString Windows64 ${LANG_FARSI} "آزادی کانکت به ویندوز ۱۰ یا جدیدتر، نسخهٔ ۶۴ بیتی، نیاز دارد."
LangString RestoreFailed ${LANG_ENGLISH} "Network lock recovery failed. Files were preserved. Run Restore Internet from Start as administrator and try uninstalling again."
LangString RestoreFailed ${LANG_FARSI} "بازیابی قفل شبکه انجام نشد. فایل‌ها حفظ شدند؛ بازیابی اینترنت را از منوی Start با دسترسی مدیر اجرا کنید."
LangString UpgradeFailed ${LANG_ENGLISH} "The network lock service could not be stopped for upgrade. Existing files were preserved. Restart Windows and try installing again."
LangString UpgradeFailed ${LANG_FARSI} "توقف سرویس محافظت برای ارتقا انجام نشد؛ فایل‌های قبلی حفظ شدند. ویندوز را دوباره راه‌اندازی و نصب را تکرار کنید."
Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "$(Windows64)"
    Abort
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
FunctionEnd
Function LaunchAzadi
  ; Use the interactive user's shell, including over-the-shoulder UAC installs.
  ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\Azadi Connect.exe" "open" ""
FunctionEnd
Function ShowPinOptions
  ; Windows owns the final pin choice. No undocumented shell verbs or policies.
  ${StdUtils.ExecShellAsUser} $0 "$WINDIR\explorer.exe" "open" '$\"$SMPROGRAMS\Azadi Connect$\"'
FunctionEnd
Function CloseForUpgrade
  FindWindow $0 "" "Azadi Connect"
  ${If} $0 == 0
    Return
  ${EndIf}
  IfFileExists "$INSTDIR\Azadi Connect.exe" 0 AskToClose
  ; 0.4+ cooperates with updates. Older versions need the tray/Retry prompt.
  GetDLLVersion "$INSTDIR\Azadi Connect.exe" $1 $2
  IntOp $3 $1 >> 16
  IntOp $4 $1 & 0xFFFF
  ${If} $3 == 0
  ${AndIf} $4 < 4
    Goto AskToClose
  ${EndIf}
  ExecWait '$\"$INSTDIR\Azadi Connect.exe$\" --quit-for-update' $1
  StrCpy $2 0
  WaitForClose:
    FindWindow $0 "" "Azadi Connect"
    ${If} $0 == 0
      Return
    ${EndIf}
    IntOp $2 $2 + 1
    ${If} $2 < 60
      Sleep 250
      Goto WaitForClose
    ${EndIf}
  AskToClose:
    IfSilent CloseAborted
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(RetryCloseApp)" IDRETRY RetryClose
  CloseAborted:
    SetErrorLevel 2
    Abort
  RetryClose:
    Call CloseForUpgrade
FunctionEnd
Function DirectoryLeave
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "Azadi Connect"
    StrCpy $INSTDIR "$INSTDIR\Azadi Connect"
  ${EndIf}
FunctionEnd
Section "Azadi Connect" MainSection
  SetRegView 64
  SetShellVarContext all
  Call CloseForUpgrade
  DetailPrint "$(InstallOrUpdate)"
  ; Use the new helper from a private installer directory, since the installed
  ; 0.2 helper does not implement this command and may itself be running.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=azadi-network-upgrade.exe "${PROJECT_DIR}\dist\win-unpacked\resources\core\network-lock.exe"
  ClearErrors
  ExecWait '"$PLUGINSDIR\azadi-network-upgrade.exe" prepare-upgrade' $0
  IfErrors UpgradeFailed
  ${If} $0 != 0
    Goto UpgradeFailed
  ${EndIf}
  Goto UpgradeReady
  UpgradeFailed:
    MessageBox MB_OK|MB_ICONSTOP "$(UpgradeFailed)"
    Abort
  UpgradeReady:
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_DIR}\dist\win-unpacked\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Azadi Connect"
  CreateShortcut "$SMPROGRAMS\Azadi Connect\Azadi Connect.lnk" "$INSTDIR\Azadi Connect.exe"
  WinShell::SetLnkAUMI "$SMPROGRAMS\Azadi Connect\Azadi Connect.lnk" "org.azadi.connect"
  CreateShortcut "$SMPROGRAMS\Azadi Connect\Restore Internet.lnk" "$INSTDIR\Azadi Connect.exe" "--restore-network"
  CreateShortcut "$SMPROGRAMS\Azadi Connect\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Azadi Connect.lnk" "$INSTDIR\Azadi Connect.exe"
  WinShell::SetLnkAUMI "$DESKTOP\Azadi Connect.lnk" "org.azadi.connect"
  WriteRegStr HKLM "Software\AzadiConnect" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "DisplayName" "Azadi Connect ${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "Publisher" "Azadi Connect contributors"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "DisplayIcon" "$INSTDIR\Azadi Connect.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect" "NoRepair" 1
SectionEnd
Function un.onInit
  !insertmacro MUI_UNGETLANGUAGE
  SetRegView 64
  SetShellVarContext all
  FindWindow $0 "" "Azadi Connect"
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(CloseApp)"
    Abort
  ${EndIf}
FunctionEnd
Section "Uninstall"
  SetRegView 64
  SetShellVarContext all
  IfFileExists "$INSTDIR\resources\core\network-lock.exe" 0 NoNetworkLock
  ExecWait '"$INSTDIR\resources\core\network-lock.exe" uninstall' $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$(RestoreFailed)"
    Abort
  ${EndIf}
  NoNetworkLock:
  !insertmacro RemoveAzadiFiles
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$DESKTOP\Azadi Connect.lnk"
  Delete "$SMPROGRAMS\Azadi Connect\Azadi Connect.lnk"
  Delete "$SMPROGRAMS\Azadi Connect\Uninstall.lnk"
  Delete "$SMPROGRAMS\Azadi Connect\Restore Internet.lnk"
  RMDir "$SMPROGRAMS\Azadi Connect"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AzadiConnect"
  DeleteRegKey HKLM "Software\AzadiConnect"
  ; Preserve user-created files and the encrypted per-user profile vault.
SectionEnd
