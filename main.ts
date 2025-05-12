#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --allow-env

import {Confirm, Input, Secret} from "@cliffy/prompt";
import {keypress} from "@cliffy/keypress";
import ora from "ora";
import * as colors from "@std/fmt/colors";
import {ensureDir, exists} from "@std/fs";
import {join} from "@std/path";


// Configuration interface
interface Config {
  organization: string;
  token: string;
  emails: string[];
}

// Function to get config file path for an organization
function getConfigFilePath(organization: string): string {
  return join(Deno.cwd(), `${organization}.config.json`);
}

// Function to read configuration from file
async function readConfig(organization?: string): Promise<Config | null> {
  try {
    // If organization is provided, read organization-specific config
    if (organization) {
      const orgConfigFile = getConfigFilePath(organization);
      if (await exists(orgConfigFile)) {
        const content = await Deno.readTextFile(orgConfigFile);
        return JSON.parse(content) as Config;
      }
    } else {
      // For backward compatibility, try to read from the default config file
      const defaultConfigFile = join(Deno.cwd(), "config.json");
      if (await exists(defaultConfigFile)) {
        const content = await Deno.readTextFile(defaultConfigFile);
        return JSON.parse(content) as Config;
      }
    }
  } catch (error: any) {
    console.error(colors.yellow(`Warning: Failed to read config file: ${error.message}`));
  }
  return null;
}

// Function to write configuration to file
async function writeConfig(config: Config): Promise<void> {
  try {
    const configFile = getConfigFilePath(config.organization);
    await Deno.writeTextFile(configFile, JSON.stringify(config, null, 2));
  } catch (error: any) {
    console.error(colors.yellow(`Warning: Failed to write config file: ${error.message}`));
  }
}

// Function to wait for a keypress before exiting
async function waitForKeyPress(): Promise<void> {
  console.log(colors.yellow("\nPress any key to exit..."));
  await keypress();
}

// Function to list available organizations from config files
async function listAvailableOrganizations(): Promise<string[]> {
  const organizations: string[] = [];

  try {
    // Read all files in the current directory
    for await (const entry of Deno.readDir(Deno.cwd())) {
      if (entry.isFile && entry.name.endsWith('.config.json')) {
        // Extract organization name from filename (remove .config.json)
        const orgName = entry.name.slice(0, -12);
        organizations.push(orgName);
      }
    }

    // Also check for the default config file
    const defaultConfigFile = join(Deno.cwd(), "config.json");
    if (await exists(defaultConfigFile)) {
      try {
        const content = await Deno.readTextFile(defaultConfigFile);
        const config = JSON.parse(content) as Config;
        if (config.organization && !organizations.includes(config.organization)) {
          organizations.push(config.organization);
        }
      } catch (e) {
        // Ignore errors reading the default config
      }
    }
  } catch (error: any) {
    console.error(colors.yellow(`Warning: Failed to list organizations: ${error.message}`));
  }

  return organizations;
}

// Azure DevOps API client
class AzureDevOpsClient {
  private baseUrl: string;
  private token: string;
  private organization: string;

  constructor(organization: string, token: string) {
    this.organization = organization;
    this.baseUrl = `https://dev.azure.com/${organization}`;
    this.token = token;
  }

  private async request(path: string, method = "GET", body?: unknown): Promise<{ data: unknown, headers: Headers }> {
    const headers = new Headers({
      "Authorization": `Basic ${btoa(`:${this.token}`)}`,
      "Content-Type": "application/json",
    });

    const response = await fetch(`${this.baseUrl}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure DevOps API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return { data, headers: response.headers };
  }

  async getProjects(): Promise<any[]> {
    const { data } = await this.request("_apis/projects?api-version=7.0");
    return (data as { value: any[] }).value;
  }

  async getRepositories(projectId: string): Promise<any[]> {
    const { data } = await this.request(`${projectId}/_apis/git/repositories?api-version=7.0`);
    return (data as { value: any[] }).value;
  }

  async getCommits(projectId: string, repositoryId: string, authorEmail: string, fromDate?: Date): Promise<any[]> {
    let path = `${projectId}/_apis/git/repositories/${repositoryId}/commits?api-version=7.0&searchCriteria.author=${encodeURIComponent(authorEmail)}`;

    if (fromDate) {
      path += `&searchCriteria.fromDate=${fromDate.toISOString()}`;
    }

    // Add a larger page size to reduce the number of API calls needed
    path += "&$top=100";

    let allCommits: any[] = [];
    let isNext: boolean | null = null;

    do {
      // Add the continuation token if we have one
      const currentPath = isNext
        ? `${path}&$skip=${allCommits.length}`
        : path;

      const { data, headers } = await this.request(currentPath);
      const responseData = data as { value: any[], count: number };

      // Add the current page of commits to our result
      allCommits = allCommits.concat(responseData.value);

      // Check if there are more pages
      // The continuation token is in the response headers
      isNext = headers.get('link')?.includes('rel="next"') ?? false;

    } while (isNext);

    return allCommits;
  }
}

// Git operations
class GitOperations {
  private repoPath: string;
  private filename: string;

  constructor(repoPath: string, organization: string) {
    this.repoPath = repoPath;
    this.filename = "foo.txt";
  }

  async initRepo(): Promise<void> {
    await ensureDir(this.repoPath);

    if (!(await exists(join(this.repoPath, ".git")))) {
      const cmd = new Deno.Command('git', {
        args: ["init"],
        stdout: "piped",
        cwd: this.repoPath
      });

      const { success, stderr  } = await cmd.output();

      if (!success) {
        const stderrString = new TextDecoder().decode(stderr);
        throw new Error(`Failed to initialize git repository: ${stderrString}`);
      }
    }
  }

  async createCommit(date: Date, message: string, content: string): Promise<void> {
    // Create or override the file
    const filePath = join(this.repoPath, this.filename);
    await Deno.writeTextFile(filePath, content);

    // Add to git
    const addCmd = new Deno.Command('git', {
      args: ["add", "."],
      cwd: this.repoPath,
      stdout: "piped",
      stderr: "piped",
    });

    const { success, stderr } = await addCmd.output();
    if (!success) {
      const stderrString = new TextDecoder().decode(stderr);
      throw new Error(`Failed to add files to git: ${stderrString}`);
    }

    // Commit with the original date
    const commitCmd = new Deno.Command('git', {
      args: ["commit", "--quiet", "--date", date.toISOString(), "-m", message],
      cwd: this.repoPath,
      stdout: "piped",
      stderr: "piped",
    });

    const { success: commitSuccess, stderr: commitStderr } = await commitCmd.output();
    if (!commitSuccess) {
      const stderrString = new TextDecoder().decode(commitStderr);
      throw new Error(`Failed to commit changes: ${stderrString}`);
    }
  }

  async getLastCommitDate(): Promise<Date | null> {
    if (!(await exists(join(this.repoPath, this.filename)))) {
      return null;
    }

    try {
      const logCmd = new Deno.Command('git', {
        args: ["log", "-1", "--format=%cd", "--date=iso", "--", this.filename],
        cwd: this.repoPath,
        stdout: "piped",
        stderr: "piped",
      });

      const { success, stdout } = await logCmd.output();
      if (!success) {
        return null;
      }

      const output = new TextDecoder().decode(stdout);

      if (!output.trim()) {
        return null;
      }

      return new Date(output.trim());
    } catch {
      return null;
    }
  }
}

// Main application
async function main() {
  console.log(colors.bold(colors.blue("\n🔄 Azure DevOps Contribution Sync Tool 🔄\n")));

  let organization: string;
  let token: string;
  let emails: string[];
  let existingConfig: Config | null = null;

  // Step 1: Organization Selection
  const availableOrganizations = await listAvailableOrganizations();

  if (availableOrganizations.length > 0) {
    console.log(colors.yellow("Found saved organizations:"));
    for (let i = 0; i < availableOrganizations.length; i++) {
      console.log(colors.yellow(`  ${i + 1}. ${availableOrganizations[i]}`));
    }

    const useExistingOrg = await Confirm.prompt({
      message: "Use one of these organizations?",
      default: true,
    });

    if (useExistingOrg) {
      let selectedIndex: number;

      if (availableOrganizations.length === 1) {
        selectedIndex = 0;
        console.log(colors.yellow(`Selected organization: ${availableOrganizations[0]}`));
      } else {
        const selection = await Input.prompt({
          message: "Enter the number of the organization to use:",
          validate: (value) => {
            const num = parseInt(value);
            return (num > 0 && num <= availableOrganizations.length) 
              ? true 
              : `Please enter a number between 1 and ${availableOrganizations.length}`;
          },
        });
        selectedIndex = parseInt(selection) - 1;
      }

      organization = availableOrganizations[selectedIndex];
      existingConfig = await readConfig(organization);
    } else {
      organization = await Input.prompt({
        message: "Enter your Azure DevOps organization name:",
        validate: (value) => value.trim() ? true : "Organization name cannot be empty",
      });
      existingConfig = await readConfig(organization);
    }
  } else {
    console.log(colors.yellow("No saved organizations found."));
    organization = await Input.prompt({
      message: "Enter your Azure DevOps organization name:",
      validate: (value) => value.trim() ? true : "Organization name cannot be empty",
    });
  }

  // Step 2: Azure DevOps Authentication
  if (existingConfig?.token) {
    console.log(colors.yellow(`Found saved Personal Access Token for organization: ${organization}`));
    const useExisting = await Confirm.prompt({
      message: "Use saved Personal Access Token?",
      default: true,
    });

    if (useExisting) {
      token = existingConfig.token;
    } else {
      token = await Secret.prompt({
        message: "Enter your Azure DevOps Personal Access Token (PAT):",
        validate: (value) => value.trim() ? true : "PAT cannot be empty",
      });
    }
  } else {
    token = await Secret.prompt({
      message: "Enter your Azure DevOps Personal Access Token (PAT):",
      validate: (value) => value.trim() ? true : "PAT cannot be empty",
    });
  }

  const azureClient = new AzureDevOpsClient(organization, token);

  // Test connection
  const spinner = ora({
    text: "Testing connection to Azure DevOps...",
  }).start();

  try {
    await azureClient.getProjects();
    spinner.succeed("Successfully connected to Azure DevOps");
  } catch (error: any) {
    spinner.fail(`Failed to connect to Azure DevOps: ${error.message}`);
    await waitForKeyPress();
    Deno.exit(1);
  }

  // Step 3: Get email addresses
  if (existingConfig?.emails && existingConfig.emails.length > 0) {
    console.log(colors.yellow(`Found saved email addresses for ${organization}: ${existingConfig.emails.join(", ")}`));
    const useExisting = await Confirm.prompt({
      message: "Use these email addresses?",
      default: true,
    });

    if (useExisting) {
      emails = existingConfig.emails;
    } else {
      const emailInput = await Input.prompt({
        message: "Enter email address(es) to search for (comma-separated for multiple):",
        validate: (value) => {
          const emails = value.split(",").map(e => e.trim());
          if (emails.length === 0 || emails.some(e => !e)) {
            return "Please enter at least one valid email address";
          }
          return true;
        },
      });
      emails = emailInput.split(",").map(e => e.trim());
    }
  } else {
    const emailInput = await Input.prompt({
      message: "Enter email address(es) to search for (comma-separated for multiple):",
      validate: (value) => {
        const emails = value.split(",").map(e => e.trim());
        if (emails.length === 0 || emails.some(e => !e)) {
          return "Please enter at least one valid email address";
        }
        return true;
      },
    });
    emails = emailInput.split(",").map(e => e.trim());
  }

  // Save the configuration to organization-specific file
  await writeConfig({
    organization,
    token,
    emails,
  });

  console.log(colors.green(`Searching for commits by: ${emails.join(", ")}`));

  // Step 4: Prepare the contributions folder and git repository
  const contributionsBasePath = join(Deno.cwd(), "contributions");
  const contributionsPath = join(contributionsBasePath, organization);
  const gitOps = new GitOperations(contributionsPath, organization);

  spinner.text = "Preparing contributions repository...";
  spinner.start();

  try {
    await gitOps.initRepo();
    spinner.succeed("Contributions repository ready");
  } catch (error: any) {
    spinner.fail(`Failed to prepare git repository: ${error.message}`);
    await waitForKeyPress();
    Deno.exit(1);
  }

  // Get the last commit date if the file exists
  const lastCommitDate = await gitOps.getLastCommitDate();
  if (lastCommitDate) {
    console.log(colors.yellow(`Found existing foo.txt with last commit date: ${lastCommitDate.toLocaleString()}`));
    console.log(colors.yellow("Only processing commits after this date."));
  }

  // Calculate date 366 days ago
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 366);
  console.log(colors.yellow(`Looking for commits within the last 366 days (since ${oneYearAgo.toLocaleString()})`));

  // Step 5: Fetch projects and repositories
  spinner.text = "Fetching projects...";
  spinner.start();

  let projects;
  try {
    projects = await azureClient.getProjects();
    spinner.succeed(`Found ${projects.length} projects`);
  } catch (error: any) {
    spinner.fail(`Failed to fetch projects: ${error.message}`);
    await waitForKeyPress();
    Deno.exit(1);
  }

  // Step 6: Process each project and repository
  const allCommits: { commit: any; project: string; repository: string }[] = [];

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    spinner.text = `Fetching repositories for project ${project.name} (${i + 1}/${projects.length})...`;
    spinner.start();

    try {
      const repositories = await azureClient.getRepositories(project.id);
      spinner.succeed(`Found ${repositories.length} repositories in project ${project.name}`);

      for (let j = 0; j < repositories.length; j++) {
        const repo = repositories[j];
        spinner.text = `Searching commits in ${project.name}/${repo.name} (${j + 1}/${repositories.length})...`;
        spinner.start();

        for (const email of emails) {
          try {
            const commits = await azureClient.getCommits(project.id, repo.id, email, lastCommitDate || undefined);

            if (commits.length > 0) {
              allCommits.push(...commits.map(commit => ({
                commit,
                project: project.name,
                repository: repo.name,
              })));

              spinner.text = `Found ${commits.length} commits by ${email} in ${project.name}/${repo.name}`;
            }
          } catch (error: any) {
            console.error(colors.red(`Error fetching commits for ${email} in ${project.name}/${repo.name}: ${error.message}`));
          }
        }

        spinner.succeed(`Processed ${project.name}/${repo.name}`);
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch repositories for project ${project.name}: ${error.message}`);
    }
  }

  // Step 7: Sort commits by date and process them
  console.log(colors.blue(`\nFound a total of ${allCommits.length} commits across all repositories`));

  if (allCommits.length === 0) {
    console.log(colors.yellow("No commits found for the specified email addresses."));
    await waitForKeyPress();
    Deno.exit(0);
  }

  // Sort commits by date (oldest first)
  allCommits.sort((a, b) => {
    return new Date(a.commit.author.date).getTime() - new Date(b.commit.author.date).getTime();
  });

  // Process commits
  console.log(colors.blue("\nProcessing commits and creating fake contributions..."));

  const progressSpinner = ora({
    text: `Processing commits (0/${allCommits.length})`,
  }).start();

  for (let i = 0; i < allCommits.length; i++) {
    const { commit, project, repository } = allCommits[i];
    const date = new Date(commit.author.date);
    const message = `fake commit (original: ${commit.commitId.substring(0, 8)} from ${project}/${repository})`;
    const content = `Commit made on ${date.toLocaleString()}\nOriginal commit: ${commit.commitId}\nProject: ${project}\nRepository: ${repository}\nAuthor: ${commit.author.name} <${commit.author.email}>\nMessage: ${commit.comment}`;

    progressSpinner.text = `Processing commits (${i + 1}/${allCommits.length})`;

    try {
      await gitOps.createCommit(date, message, content);
    } catch (error: any) {
      progressSpinner.fail(`Failed to create commit: ${error.message}`);
      console.error(colors.red(`Error processing commit ${commit.commitId}: ${error.message}`));
    }
  }

  progressSpinner.succeed(`Successfully processed all ${allCommits.length} commits`);

  console.log(colors.bold(colors.green("\n✅ Contribution sync completed successfully!")));
  console.log(colors.blue(`Your contributions have been synced to: ${contributionsPath}`));

  // Wait for keypress before exiting
  await waitForKeyPress();
}

// Run the application
if (import.meta.main) {
  try {
    await main();
  } catch (error: any) {
    console.error(colors.bold(colors.red(`\n❌ Error: ${error.message}`)));
    await waitForKeyPress();
    Deno.exit(1);
  }
}
