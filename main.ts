#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run --allow-env

import { Command } from "@cliffy/command";
import { Input, Secret, Select, Confirm } from "@cliffy/prompt";
import ora from "ora";
import * as colors from "@std/fmt/colors";
import { ensureDir, exists } from "@std/fs";
import { join, dirname } from "@std/path";

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

  private async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
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

    return response.json();
  }

  async getProjects(): Promise<any[]> {
    const response = await this.request("_apis/projects?api-version=7.0") as { value: any[] };
    return response.value;
  }

  async getRepositories(projectId: string): Promise<any[]> {
    const response = await this.request(`${projectId}/_apis/git/repositories?api-version=7.0`) as { value: any[] };
    return response.value;
  }

  async getCommits(projectId: string, repositoryId: string, authorEmail: string, fromDate?: Date): Promise<any[]> {
    let path = `${projectId}/_apis/git/repositories/${repositoryId}/commits?api-version=7.0&searchCriteria.author=${encodeURIComponent(authorEmail)}`;

    if (fromDate) {
      path += `&searchCriteria.fromDate=${fromDate.toISOString()}`;
    }

    const response = await this.request(path) as { value: any[] };
    return response.value;
  }
}

// Git operations
class GitOperations {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
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
    const filePath = join(this.repoPath, "foo.txt");
    await Deno.writeTextFile(filePath, content);

    // Add to git
    const addCmd = new Deno.Command('git', {
      args: ["add", "."],
      cwd: this.repoPath,
      stdin: "piped",
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
      stdin: "piped",
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
    if (!(await exists(join(this.repoPath, "foo.txt")))) {
      return null;
    }

    try {
      const logCmd = new Deno.Command('git', {
        args: ["log", "-1", "--format=%cd", "--date=iso", "--", "foo.txt"],
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

  // Step 1: Azure DevOps Authentication
  const organization = await Input.prompt({
    message: "Enter your Azure DevOps organization name:",
    validate: (value) => value.trim() ? true : "Organization name cannot be empty",
  });

  const token = await Secret.prompt({
    message: "Enter your Azure DevOps Personal Access Token (PAT):",
    validate: (value) => value.trim() ? true : "PAT cannot be empty",
  });

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
    Deno.exit(1);
  }

  // Step 2: Get email addresses
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

  const emails = emailInput.split(",").map(e => e.trim());
  console.log(colors.green(`Searching for commits by: ${emails.join(", ")}`));

  // Step 3: Prepare the contributions folder and git repository
  const contributionsPath = join(Deno.cwd(), "contributions");
  const gitOps = new GitOperations(contributionsPath);

  spinner.text = "Preparing contributions repository...";
  spinner.start();

  try {
    await gitOps.initRepo();
    spinner.succeed("Contributions repository ready");
  } catch (error: any) {
    spinner.fail(`Failed to prepare git repository: ${error.message}`);
    Deno.exit(1);
  }

  // Get the last commit date if the file exists
  const lastCommitDate = await gitOps.getLastCommitDate();
  if (lastCommitDate) {
    console.log(colors.yellow(`Found existing foo.txt with last commit date: ${lastCommitDate.toLocaleString()}`));
    console.log(colors.yellow("Only processing commits after this date."));
  }

  // Step 4: Fetch projects and repositories
  spinner.text = "Fetching projects...";
  spinner.start();

  let projects;
  try {
    projects = await azureClient.getProjects();
    spinner.succeed(`Found ${projects.length} projects`);
  } catch (error: any) {
    spinner.fail(`Failed to fetch projects: ${error.message}`);
    Deno.exit(1);
  }

  // Step 5: Process each project and repository
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

  // Step 6: Sort commits by date and process them
  console.log(colors.blue(`\nFound a total of ${allCommits.length} commits across all repositories`));

  if (allCommits.length === 0) {
    console.log(colors.yellow("No commits found for the specified email addresses."));
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
}

// Run the application
if (import.meta.main) {
  try {
    await main();
  } catch (error: any) {
    console.error(colors.bold(colors.red(`\n❌ Error: ${error.message}`)));
    Deno.exit(1);
  }
}
