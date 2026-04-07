#include <csignal>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <windows.h>

const std::string HOSTS_PATH = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const std::string REDIRECT_IP = "127.0.0.1";
const std::string START_MARKER = "# --- FOCUS MODE START ---";
const std::string END_MARKER = "# --- FOCUS MODE END ---";

const std::vector<std::string> BLOCKED_SITES = {
    "youtube.com", "www.youtube.com",
    "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com",
    "twitter.com", "www.twitter.com",
    "x.com", "www.x.com",
    "reddit.com", "www.reddit.com"
};

bool isAdmin() {
    BOOL isAdminUser = FALSE;
    PSID adminGroup = NULL;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;

    if (AllocateAndInitializeSid(
            &ntAuthority,
            2,
            SECURITY_BUILTIN_DOMAIN_RID,
            DOMAIN_ALIAS_RID_ADMINS,
            0,
            0,
            0,
            0,
            0,
            0,
            &adminGroup)) {
        CheckTokenMembership(NULL, adminGroup, &isAdminUser);
        FreeSid(adminGroup);
    }

    return isAdminUser == TRUE;
}

void unblockSites() {
    std::cout << "\n[INFO] Restoring internet access..." << std::endl;

    std::ifstream inFile(HOSTS_PATH);
    if (!inFile.is_open()) {
        std::cerr << "[ERROR] Could not open hosts file for reading." << std::endl;
        return;
    }

    std::vector<std::string> lines;
    std::string line;
    bool inBlockedSection = false;

    while (std::getline(inFile, line)) {
        if (line.find(START_MARKER) != std::string::npos) {
            inBlockedSection = true;
            continue;
        }
        if (line.find(END_MARKER) != std::string::npos) {
            inBlockedSection = false;
            continue;
        }

        if (!inBlockedSection) {
            lines.push_back(line);
        }
    }
    inFile.close();

    std::ofstream outFile(HOSTS_PATH, std::ios::trunc);
    if (!outFile.is_open()) {
        std::cerr << "[ERROR] Could not open hosts file for writing." << std::endl;
        return;
    }

    for (const auto& l : lines) {
        outFile << l << "\n";
    }

    outFile.close();
    std::cout << "[OK] Websites restored." << std::endl;
    std::system("ipconfig /flushdns > nul 2>&1");
}

void blockSites() {
    unblockSites();

    std::cout << "[INFO] Blocking distracting websites..." << std::endl;

    std::ofstream outFile(HOSTS_PATH, std::ios::app);
    if (!outFile.is_open()) {
        std::cerr << "[ERROR] Could not open hosts file for writing." << std::endl;
        return;
    }

    outFile << "\n" << START_MARKER << "\n";
    for (const auto& site : BLOCKED_SITES) {
        outFile << REDIRECT_IP << " " << site << "\n";
    }
    outFile << END_MARKER << "\n";

    outFile.close();
    std::cout << "[OK] Websites blocked." << std::endl;
    std::system("ipconfig /flushdns > nul 2>&1");
}

void signalHandler(int signum) {
    std::cout << "\n\n[WARN] Interrupted by user." << std::endl;
    unblockSites();
    std::exit(signum);
}

int main(int argc, char* argv[]) {
    if (!isAdmin()) {
        std::cerr << "[ERROR] Run this program as Administrator." << std::endl;
        return 1;
    }

    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <minutes> OR " << argv[0] << " unlock" << std::endl;
        return 1;
    }

    std::string arg1 = argv[1];

    if (arg1 == "unlock") {
        unblockSites();
        return 0;
    }

    try {
        int minutes = std::stoi(arg1);
        if (minutes <= 0) {
            std::cerr << "[ERROR] Minutes must be greater than 0." << std::endl;
            return 1;
        }

        int seconds = minutes * 60;

        signal(SIGINT, signalHandler);

        blockSites();

        std::cout << "\n[INFO] Focus Mode active for " << minutes << " minutes." << std::endl;

        while (seconds > 0) {
            int m = seconds / 60;
            int s = seconds % 60;
            std::printf("\rTime remaining: %02d:%02d ", m, s);
            std::fflush(stdout);

            Sleep(1000);
            --seconds;
        }

        std::cout << "\n\n[OK] Time is up." << std::endl;
        unblockSites();
    } catch (const std::exception&) {
        std::cerr << "[ERROR] Invalid input. Pass a number of minutes or 'unlock'." << std::endl;
        return 1;
    }

    return 0;
}
