/* SPDX-License-Identifier: GPL-3.0-or-later
 * Supervises only the bundled sing-box child. Closing the parent pipe requests
 * graceful termination; Windows Job Objects close the child on guardian exit.
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
#include <stdio.h>

static int failed(const char *stage, int code) {
    fprintf(stderr, "guardian: %s failed (Windows error %lu)\n", stage, GetLastError());
    fflush(stderr);
    return code;
}

int wmain(int argc, wchar_t **argv) {
    if (argc != 3) return 64;
    HANDLE parentInput = GetStdHandle(STD_INPUT_HANDLE);
    HANDLE inheritedOut = GetStdHandle(STD_OUTPUT_HANDLE);
    HANDLE inheritedErr = GetStdHandle(STD_ERROR_HANDLE);
    if (!GetConsoleWindow()) AllocConsole();
    HWND console = GetConsoleWindow();
    if (console) ShowWindow(console, SW_HIDE);
    SetConsoleCtrlHandler(NULL, TRUE);
    HANDLE job = CreateJobObjectW(NULL, NULL);
    if (!job) return failed("CreateJobObject", 65);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { int code=failed("SetInformationJobObject",66); CloseHandle(job); return code; }
    size_t size = wcslen(argv[1]) + wcslen(argv[2]) + 32;
    wchar_t *command = (wchar_t *)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, size * sizeof(wchar_t));
    if (!command) { CloseHandle(job); return 67; }
    swprintf(command, size, L"\"%ls\" run -c \"%ls\"", argv[1], argv[2]);
    STARTUPINFOW startup = {0}; PROCESS_INFORMATION child = {0};
    startup.cb = sizeof(startup); startup.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_HIDE;
    startup.hStdInput = parentInput; startup.hStdOutput = inheritedOut; startup.hStdError = inheritedErr;
    BOOL created = CreateProcessW(argv[1], command, NULL, NULL, TRUE,
        CREATE_NEW_PROCESS_GROUP | CREATE_SUSPENDED, NULL, NULL, &startup, &child);
    HeapFree(GetProcessHeap(), 0, command);
    if (!created) { int code=failed("CreateProcess",68); CloseHandle(job); return code; }
    if (!AssignProcessToJobObject(job, child.hProcess)) {
        int code=failed("AssignProcessToJobObject",69);
        TerminateProcess(child.hProcess, 69); CloseHandle(child.hThread); CloseHandle(child.hProcess); CloseHandle(job); return code;
    }
    ResumeThread(child.hThread); CloseHandle(child.hThread);
    for (;;) {
        if (WaitForSingleObject(child.hProcess, 150) == WAIT_OBJECT_0) break;
        DWORD available = 0;
        if (!PeekNamedPipe(parentInput, NULL, 0, NULL, &available, NULL) || available > 0) {
            GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT, child.dwProcessId);
            if (WaitForSingleObject(child.hProcess, 4000) != WAIT_OBJECT_0) TerminateJobObject(job, 70);
            WaitForSingleObject(child.hProcess, 1000);
            break;
        }
    }
    DWORD code = 1; GetExitCodeProcess(child.hProcess, &code);
    CloseHandle(child.hProcess); CloseHandle(job);
    return (int)code;
}
