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

