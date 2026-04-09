#include <windows.h>
#include <tlhelp32.h>
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <set>
#include <algorithm>
#include <cctype>
#include <cwctype>
#include <mutex>
// Removed thread & chrono using raw WinAPI instead
#include <atomic>

const std::string PIPE_NAME = "\\\\.\\pipe\\FocusModePipe";
const std::string HOSTS_PATH = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const std::string REDIRECT_IP = "127.0.0.1";
const std::string START_MARKER = "# --- FOCUS MODE START ---";
const std::string END_MARKER = "# --- FOCUS MODE END ---";
const std::string SCREEN_TIME_LOG = "screen_time.log";
const std::string BLOCKED_ITEMS_FILE = "blocked_items.json";

const std::vector<std::string> DEFAULT_BLOCKED_SITES = {
    "youtube.com", "www.youtube.com", "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com", "twitter.com", "www.twitter.com",
    "x.com", "www.x.com", "reddit.com", "www.reddit.com"
};

const std::vector<std::wstring> DEFAULT_BLOCKED_APPS = {
    L"steam.exe", L"discord.exe", L"msedge.exe", L"chrome.exe"
};

std::atomic<bool> isFocusModeActive(false);
std::atomic<int> focusTimeRemaining(0);
std::mutex blockedItemsMutex;
std::vector<std::string> activeBlockedSites = DEFAULT_BLOCKED_SITES;
std::vector<std::wstring> activeBlockedApps = DEFAULT_BLOCKED_APPS;

std::string toLowerAscii(const std::string& in) {
    std::string out = in;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return out;
}

std::string trimAscii(const std::string& in) {
    size_t start = 0;
    while (start < in.size() && std::isspace(static_cast<unsigned char>(in[start]))) start++;
    size_t end = in.size();
    while (end > start && std::isspace(static_cast<unsigned char>(in[end - 1]))) end--;
    return in.substr(start, end - start);
}

std::wstring toWide(const std::string& s) {
    return std::wstring(s.begin(), s.end());
}

std::string getExeDirectory() {
    char path[MAX_PATH] = {0};
    DWORD len = GetModuleFileNameA(NULL, path, MAX_PATH);
    if (len == 0 || len == MAX_PATH) return ".";
    std::string full(path, len);
    size_t pos = full.find_last_of("\\/");
    return (pos == std::string::npos) ? "." : full.substr(0, pos);
}

std::string getBlockedItemsPath() {
    return getExeDirectory() + "\\" + BLOCKED_ITEMS_FILE;
}

std::vector<std::string> extractJsonStringValues(const std::string& content) {
    std::vector<std::string> values;
    std::string current;
    bool inString = false;
    bool escaped = false;

    for (char ch : content) {
        if (!inString) {
            if (ch == '"') {
                inString = true;
                current.clear();
            }
            continue;
        }

        if (escaped) {
            current.push_back(ch);
            escaped = false;
            continue;
        }

        if (ch == '\\') {
            escaped = true;
            continue;
        }

        if (ch == '"') {
            inString = false;
            values.push_back(current);
            continue;
        }

        current.push_back(ch);
    }

    return values;
}

void loadBlockedItemsForSession() {
    std::ifstream in(getBlockedItemsPath());
    std::string raw;

    if (in.is_open()) {
        raw.assign((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    }

    std::set<std::string> sites;
    std::set<std::wstring> apps;

    if (!raw.empty()) {
        auto values = extractJsonStringValues(raw);
        for (auto value : values) {
            value = toLowerAscii(trimAscii(value));
            if (value.empty()) continue;

            if (value.size() >= 4 && value.rfind(".exe") == value.size() - 4) {
                apps.insert(toWide(value));
                continue;
            }

            sites.insert(value);
            if (value.rfind("www.", 0) == 0 && value.size() > 4) {
                sites.insert(value.substr(4));
            } else {
                sites.insert("www." + value);
            }
        }
    }

    if (sites.empty()) {
        sites.insert(DEFAULT_BLOCKED_SITES.begin(), DEFAULT_BLOCKED_SITES.end());
    }
    if (apps.empty()) {
        apps.insert(DEFAULT_BLOCKED_APPS.begin(), DEFAULT_BLOCKED_APPS.end());
    }

    std::lock_guard<std::mutex> lock(blockedItemsMutex);
    activeBlockedSites.assign(sites.begin(), sites.end());
    activeBlockedApps.assign(apps.begin(), apps.end());
}

std::vector<std::string> getBlockedSitesSnapshot() {
    std::lock_guard<std::mutex> lock(blockedItemsMutex);
    return activeBlockedSites;
}

std::vector<std::wstring> getBlockedAppsSnapshot() {
    std::lock_guard<std::mutex> lock(blockedItemsMutex);
    return activeBlockedApps;
}

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
    auto blockedSites = getBlockedSitesSnapshot();
    if (outFile.is_open()) {
        outFile << "\n" << START_MARKER << "\n";
        for (const auto& site : blockedSites) outFile << REDIRECT_IP << " " << site << "\n";
        outFile << END_MARKER << "\n";
        outFile.close();
        std::system("ipconfig /flushdns > nul 2>&1");
    }
}

void killDistractingProcesses() {
    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    auto blockedApps = getBlockedAppsSnapshot();
    if (hSnap != INVALID_HANDLE_VALUE) {
        PROCESSENTRY32W pe;
        pe.dwSize = sizeof(PROCESSENTRY32W);
        if (Process32FirstW(hSnap, &pe)) {
            do {
                std::wstring exeName = pe.szExeFile;
                // Convert to lowercase roughly
                for (auto& c : exeName) c = towlower(c);
                for (const auto& blocked : blockedApps) {
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
                    // Freeze blocked list for this session at start time.
                    loadBlockedItemsForSession();
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
