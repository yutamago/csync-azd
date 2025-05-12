#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

// This script reads the version from deno.json and runs the appropriate build commands
// with the version substituted for the $VERSION placeholder

import { join } from "@std/path";

// Read the deno.json file to get the version
const denoJsonPath = join(Deno.cwd(), "deno.json");
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
const version = denoJson.version;

if (!version) {
  console.error("No version found in deno.json");
  Deno.exit(1);
}

console.log(`Building version ${version}`);

// Set the VERSION environment variable for the build commands
Deno.env.set("VERSION", version);

// Get the platform-specific command to run
const platform = Deno.args[0] || "all";

async function runCommand(cmd: string[], options: Deno.CommandOptions = {}) {
  console.log(`Running: ${cmd.join(" ")}`);
  
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
    ...options
  });
  
  const { success } = await command.output();
  
  if (!success) {
    console.error(`Command failed: ${cmd.join(" ")}`);
    Deno.exit(1);
  }
}

// Run the appropriate build command
switch (platform) {
  case "local":
    await runCommand(["deno", "task", "compile:local"]);
    break;
  case "win":
    await runCommand(["deno", "task", "compile:win"]);
    break;
  case "mac":
    await runCommand(["deno", "task", "compile:mac"]);
    break;
  case "linux":
    await runCommand(["deno", "task", "compile:linux"]);
    break;
  case "all":
    await runCommand(["deno", "task", "compile"]);
    break;
  default:
    console.error(`Unknown platform: ${platform}`);
    console.log("Usage: deno run -A build.ts [local|win|mac|linux|all]");
    Deno.exit(1);
}

console.log(`Build completed for version ${version}`);
