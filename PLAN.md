This is a backend service project which periodically looks for updates for given tools/plugins/repos, etc.

At work, i am working on an intranet envrionment which does not access to internet directly. Hence, i should manually check whether there are some updates of my tool stack. and through nexus repository, or through some manual methods i get the updates. 

This manual checking is exhausting, so i am building this service which informs me from telegram whenever there is an update.

Of course in order to decide there is an update, this service should also store the current versions (latest detected) for each entity.

This service should check the followings:
- VSCode (from fetching https://update.code.visualstudio.com/api/releases/stable (newest first))
- Claude Code CLI (from fetching https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/latest, you can also use https://api.github.com/repos/anthropics/claude-code/releases/latest as the fallback)
- Ninja build system (from github repo https://github.com/ninja-build/ninja releases section)
- Cmake (https://cmake.org/files/LatestRelease/ has the list, with its modified date)
- Git (using https://api.github.com/repos/git-for-windows/git/releases/latest)
- Clangd (https://api.github.com/repos/clangd/clangd/releases/latest )
- Wezterm (https://api.github.com/repos/wezterm/wezterm/releases/latest)
- Ralphy (through npm view ralphy-cli version)
- VSCode cpptools vsix (https://api.github.com/repos/microsoft/vscode-cpptools/releases/latest )
- VSCode clangs vsix (https://api.github.com/repos/clangd/vscode-clangd/releases/latest)
- VSCode claude code vsix (https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
- CMake Tools (https://api.github.com/repos/microsoft/vscode-cmake-tools/releases/latest )
- Roo Code vsix (https://api.github.com/repos/RooCodeInc/Roo-Code/releases/latest )
- Atlassian vsix (https://api.github.com/repos/atlassian/atlascode/releases/latest )
- Zed (https://api.github.com/repos/zed-industries/zed/releases/latest )

Claude for download link is as follows for version 2.1.19 is https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/2.1.19/win32-x64/claude.exe
it can be {NEXUR_URL}storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/2.1.19/win32-x64/claude.exe

For ninja version 1.13.2, it is https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip

For Cmake version 4.2.2, it is https://github.com/Kitware/CMake/releases/download/v4.2.2/cmake-4.2.2-windows-x86_64.zip

For Git version 2.52.0.windows.1 it is https://github.com/git-for-windows/git/releases/download/v2.52.0.windows.1/Git-2.52.0-64-bit.exe

For Clangd version 21.1.8, it is https://github.com/clangd/clangd/releases/download/21.1.8/clangd-windows-21.1.8.zip

For Wezterm version 20240203-110809-5046fc22, it is https://github.com/wezterm/wezterm/releases/download/20240203-110809-5046fc22/WezTerm-20240203-110809-5046fc22-setup.exe

For ralphy, it should only trigger npm update -g ralphy-cli on the intranet

For vscode-cpptools version 1.29.3, it is https://github.com/microsoft/vscode-cpptools/releases/download/v1.29.3/cpptools-windows-x64.vsix

For vscode-clangd version 0.4.0, it is https://github.com/clangd/vscode-clangd/releases/download/0.4.0/vscode-clangd-0.4.0.vsix

For CMake Tools version 1.21.36, it is https://github.com/microsoft/vscode-cmake-tools/releases/download/v1.21.36/cmake-tools.vsix

For Roo Code version 3.43.0, it is https://github.com/RooCodeInc/Roo-Code/releases/download/v3.43.0/roo-cline-3.43.0.vsix

For Atlascode version 4.0.17, it is https://github.com/atlassian/atlascode/releases/download/v4.0.17/atlascode-4.0.17.vsix

For Zed version 0.220.5, it is https://github.com/zed-industries/zed/releases/download/v0.220.5/Zed-x86_64.exe

Leave configuring vscode