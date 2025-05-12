# Azure DevOps Contribution Sync Tool

A command-line tool that syncs your Azure DevOps commits to a local Git repository.

## What it does

- Logs into your Azure DevOps account using a Personal Access Token
- Finds all commits made by your email address(es) across all accessible repositories
- Creates a local Git repository with commits that mirror your Azure DevOps contributions
- Only processes commits from the last 366 days or newer than existing commits

## Installation

### Download pre-built binary

Download the appropriate binary for your platform from the [Releases](https://github.com/yourusername/contribution-sync-azure-devops-to-github/releases) page:

```
# Windows
csync-azd-windows-x86_64-v1.0.0.exe

# macOS (Intel)
csync-azd-macos-x86_64-v1.0.0

# macOS (Apple Silicon)
csync-azd-macos-arm64-v1.0.0

# Linux (x86_64)
csync-azd-linux-x86_64-v1.0.0

# Linux (ARM64)
csync-azd-linux-arm64-v1.0.0
```

### Run with Deno

```bash
# Clone the repository
git clone https://github.com/yourusername/contribution-sync-azure-devops-to-github.git
cd contribution-sync-azure-devops-to-github

# Run with Deno
deno task start
```

## Quick Start

1. Run the tool:
   ```bash
   ./csync-azd-windows-x86_64-v1.0.0.exe
   ```

2. Enter your Azure DevOps organization name:
   ```
   Enter your Azure DevOps organization name: myorganization
   ```

3. Enter your Personal Access Token (PAT):
   ```
   Enter your Azure DevOps Personal Access Token (PAT): ********
   ```

4. Enter your email address(es):
   ```
   Enter email address(es) to search for (comma-separated for multiple): user@example.com,another@example.com
   ```

5. The tool will:
   - Connect to Azure DevOps
   - Find all your commits
   - Create a local Git repository in `contributions/myorganization/`
   - Create commits that mirror your Azure DevOps contributions

## Creating a Personal Access Token (PAT)

1. Go to https://dev.azure.com/{organization}/_usersSettings/tokens
2. Click "New Token"
3. Name: "Contribution Sync"
4. Organization: Select your organization
5. Expiration: Set as needed
6. Scopes: Select "Read" for "Code"
7. Create and copy the token

## Examples

### First-time use

```bash
./csync-azd-windows-x86_64-v1.0.0.exe

> Enter your Azure DevOps organization name: myorganization
> Enter your Azure DevOps Personal Access Token (PAT): ********
> Enter email address(es) to search for: user@example.com
```

### Subsequent use

The tool saves your configuration, so next time you can just:

```bash
./csync-azd-windows-x86_64-v1.0.0.exe

> Use saved organization "myorganization"? (y/n): y
> Use saved Personal Access Token? (y/n): y
> Use these email addresses? (y/n): y
```

## Building from Source

```bash
# Build for all platforms
deno task build

# Build for specific platform
deno task build:win
deno task build:mac
deno task build:linux
```

## License

MIT
