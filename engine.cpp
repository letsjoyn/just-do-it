#include <windows.h>
#include <tlhelp32.h>
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
// Removed thread & chrono using raw WinAPI instead
#include <atomic>

const std::string PIPE_NAME = "\\\\.\\pipe\\FocusModePipe";
const std::string HOSTS_PATH = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const std::string REDIRECT_IP = "127.0.0.1";
const std::string START_MARKER = "# --- FOCUS MODE START ---";
const std::string END_MARKER = "# --- FOCUS MODE END ---";
const std::string SCREEN_TIME_LOG = "screen_time.log";

const std::vector<std::string> BLOCKED_SITES = {
    "youtube.com", "www.youtube.com", "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com", "twitter.com", "www.twitter.com",
    "x.com", "www.x.com", "reddit.com", "www.reddit.com"
};

const std::vector<std::wstring> BLOCKED_APPS = {
    L"steam.exe", L"discord.exe", L"msedge.exe", L"chrome.exe"
};

std::atomic<bool> isFocusModeActive(false);
std::atomic<int> focusTimeRemaining(0);

void unblockSites() {
    std::ifstream inFile(HOSTS_PATH);
    if (!inFile.is_open()) return;

    std::vector<std::string> lines;
    std::string line;
    bool inBlockedSection = false;

    while (std::getline(inFile, line)) {
        if (line.find(START_MARKER) != std::string::npos) { inBlockedSection = true; continue; }
        if (line.find(END_MARKER) != std::string::npos) { inBlockedSection = false; continue; }
        if (!inBlockedSection) lines.push_back(line);
    }
    inFile.close();

    std::ofstream outFile(HOSTS_PATH, std::ios::trunc);
    if (outFile.is_open()) {
        for (const auto& l : lines) outFile << l << "\n";
        outFile.close();
        std::system("ipconfig /flushdns > nul 2>&1");
    }
}

void blockSites() {
    unblockSites();
    std::ofstream outFile(HOSTS_PATH, std::ios::app);
    if (outFile.is_open()) {
        outFile << "\n" << START_MARKER << "\n";
        for (const auto& site : BLOCKED_SITES) outFile << REDIRECT_IP << " " << site << "\n";
        outFile << END_MARKER << "\n";
        outFile.close();
        std::system("ipconfig /flushdns > nul 2>&1");
    }
}

void killDistractingProcesses() {
    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnap != INVALID_HANDLE_VALUE) {
        PROCESSENTRY32W pe;
        pe.dwSize = sizeof(PROCESSENTRY32W);
        if (Process32FirstW(hSnap, &pe)) {
            do {
                std::wstring exeName = pe.szExeFile;
                // Convert to lowercase roughly
                for (auto& c : exeName) c = towlower(c);
                for (const auto& blocked : BLOCKED_APPS) {
                    if (exeName == blocked) {
                        HANDLE hProcess = OpenProcess(PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
                        if (hProcess != NULL) {
                            TerminateProcess(hProcess, 9);
                            CloseHandle(hProcess);
                        }
                    }
                }
            } while (Process32NextW(hSnap, &pe));
        }
        CloseHandle(hSnap);
    }
}

void logActiveWindow() {
    HWND fgWindow = GetForegroundWindow();
    if (fgWindow) {
        char windowTitle[256];
        if (GetWindowTextA(fgWindow, windowTitle, sizeof(windowTitle)) > 0) {
            std::ofstream log(SCREEN_TIME_LOG, std::ios::app);
            if (log.is_open()) {
                SYSTEMTIME st;
                GetLocalTime(&st);
                log << "[" << st.wYear << "-" << st.wMonth << "-" << st.wDay << " " 
                    << st.wHour << ":" << st.wMinute << ":" << st.wSecond << "] " 
                    << windowTitle << "\n";
                log.close();
            }
        }
    }
}

DWORD WINAPI backgroundTrackerLoop(LPVOID lpParam) {
    while (true) {
        if (isFocusModeActive) { // Enforce and track every few seconds
            killDistractingProcesses();
            if (focusTimeRemaining > 0) {
                focusTimeRemaining -= 2;
                if (focusTimeRemaining <= 0) {
                    isFocusModeActive = false;
                    unblockSites();
                }
            }
        }
        logActiveWindow();
        Sleep(2000);
    }
    return 0;
}

void startPipeServer() {
    std::cout << "[Engine] Starting IPC Server..." << std::endl;
    while (true) {
        HANDLE hPipe = CreateNamedPipeA(PIPE_NAME.c_str(),
            PIPE_ACCESS_DUPLEX, PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            1, 1024, 1024, 0, NULL);
        
        if (hPipe == INVALID_HANDLE_VALUE) { 
            Sleep(1000); 
            continue; 
        }

        std::cout << "[Engine] Waiting for connection from GUI..." << std::endl;
        if (ConnectNamedPipe(hPipe, NULL) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED)) {
            char buffer[128];
            DWORD bytesRead;
            while (ReadFile(hPipe, buffer, sizeof(buffer) - 1, &bytesRead, NULL)) {
                buffer[bytesRead] = '\0';
                std::string cmd(buffer);
                
                std::string response = "OK";

                if (cmd.rfind("START ", 0) == 0) {
                    int mins = std::stoi(cmd.substr(6));
                    focusTimeRemaining = mins * 60;
                    isFocusModeActive = true;
                    blockSites();
                    response = "STARTED";
                    std::cout << "[Engine] Focus started for " << mins << " mins." << std::endl;
                } else if (cmd == "UNLOCK") {
                    isFocusModeActive = false;
                    focusTimeRemaining = 0;
                    unblockSites();
                    response = "UNLOCKED";
                    std::cout << "[Engine] Focus unlocked early." << std::endl;
                } else if (cmd == "STATUS") {
                    response = isFocusModeActive ? std::to_string((int)focusTimeRemaining) : "IDLE";
                }

                DWORD bytesWritten;
                WriteFile(hPipe, response.c_str(), response.length(), &bytesWritten, NULL);
            }
        }
        DisconnectNamedPipe(hPipe);
        CloseHandle(hPipe);
    }
}

bool isAdmin() {
    BOOL isAdminUser = FALSE;
    PSID adminGroup = NULL;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
        CheckTokenMembership(NULL, adminGroup, &isAdminUser);
        FreeSid(adminGroup);
    }
    return isAdminUser == TRUE;
}

int main() {
    if (!isAdmin()) {
        std::cerr << "[Engine Error] Run this as Administrator!" << std::endl;
        return 1;
    }
    
    HANDLE hBg = CreateThread(NULL, 0, backgroundTrackerLoop, NULL, 0, NULL);
    startPipeServer();
    if (hBg) { WaitForSingleObject(hBg, INFINITE); CloseHandle(hBg); }
    return 0;
}
