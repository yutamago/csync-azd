# Azure DevOps Contribution Sync Tool

A tool that helps you sync your Azure DevOps contributions to Github.

## Prerequisites

- [Deno](https://deno.land/) v1.32.0 or higher
- [Git](https://git-scm.com/) installed and available in your PATH
- An Azure DevOps account with a Personal Access Token (PAT)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/contribution-sync-azure-devops-to-github.git
   cd contribution-sync-azure-devops-to-github
   ```

2. Run the tool using Deno:
   ```
   deno task start
   ```

   Or, if you prefer to run it directly:
   ```
   deno run --allow-net --allow-read --allow-write --allow-run --allow-env --allow-sys main.ts
   ```

## Usage

When you run the tool, it will guide you through the following steps:

1. **Organization Selection**: Choose an existing organization or enter a new one
2. **Authentication**: Enter your Azure DevOps Personal Access Token (PAT) or use a saved one
3. **Email Selection**: Enter one or more email addresses to search for commits
4. **Repository Preparation**: The tool will create a local Git repository in `contributions/{organization}/`
5. **Commit Syncing**: The tool will find all your commits and recreate them in the local repository

### Creating a Personal Access Token (PAT)

1. Go to your Azure DevOps organization settings
2. Select "Personal access tokens"
3. Click "New Token"
4. Give it a name and set the expiration
5. Select the following scopes:
   - Code: Read
   - Project and Team: Read
6. Click "Create" and copy your token

## Configuration

The tool saves your configuration in organization-specific files:
- `{organization}.config.json`: Contains your organization name, PAT, and email addresses

These files are created automatically when you use the tool. You can edit them manually if needed.

## Examples

### Basic Usage

```
deno task start
```

Follow the prompts to enter your organization, PAT, and email addresses.

### Switching Between Organizations

When you run the tool, it will show you a list of previously used organizations. You can select one to quickly switch between different Azure DevOps organizations.

## How It Works

1. The tool connects to the Azure DevOps API using your PAT
2. It searches all accessible projects and repositories for commits made by your email addresses
3. For each commit found, it creates a file in a local Git repository with the commit's timestamp
4. It commits this file with the original commit date, creating a history that mirrors your Azure DevOps contributions

## Troubleshooting

### Authentication Issues

If you see "Failed to connect to Azure DevOps", check that:
- Your PAT is correct and hasn't expired
- Your organization name is spelled correctly
- Your PAT has the necessary permissions (Code: Read, Project and Team: Read)

### No Commits Found

If the tool doesn't find any commits, check that:
- You've entered the correct email addresses
- The email addresses match those used in your Azure DevOps commits
- You have commits within the last 366 days

### Git Issues

If you encounter Git-related errors, ensure that:
- Git is installed and available in your PATH
- You have permission to create and write to the `contributions` directory

## Releases and Binaries

Pre-built binaries for Windows, macOS, and Linux are available on the [Releases](https://github.com/yourusername/contribution-sync-azure-devops-to-github/releases) page. Download the appropriate binary for your platform:

- Windows (x86_64): `csync-azd-windows-x86_64.exe`
- macOS (x86_64): `csync-azd-macos-x86_64`
- macOS (arm64): `csync-azd-macos-arm64`
- Linux (x86_64): `csync-azd-linux-x86_64`
- Linux (arm64): `csync-azd-linux-arm64`

### Creating a New Release

To create a new release:

1. Update the version number in your code if applicable
2. Create a new tag with a version number (e.g., `v1.0.0`):
   ```
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The GitHub Actions workflow will automatically build the binaries and create a release

### Building Locally

If you prefer to build the binaries locally:

```
deno task compile:local  # Build for the local platform
deno task compile        # Build for all platforms
deno task compile:win    # Build for Windows only
deno task compile:mac    # Build for macOS only
deno task compile:linux  # Build for Linux only
```

The binaries will be available in the `bin` directory with the following names:
- `csync-azd-windows-x86_64.exe` (Windows)
- `csync-azd-macos-x86_64` (macOS x86_64)
- `csync-azd-macos-arm64` (macOS arm64)
- `csync-azd-linux-x86_64` (Linux x86_64)
- `csync-azd-linux-arm64` (Linux arm64)

## License

[MIT License](LICENSE)
