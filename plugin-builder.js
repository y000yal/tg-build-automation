#!/usr/bin/env node

/**
 * Node.js script to build specific User Registration plugins and create zip files
 * Usage: node plugin-builder.js [options]
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createReadStream } = require("fs");

// Configuration
const CONFIG = {
  pluginsPath: "..", // Parent directory (plugins folder) - Change this to absolute path if needed
  pluginPattern: /^user-registration-/,
  outputDir: "build-output",
  pluginListFile: "plugin-list.json",
  resultFile: "build-results.md",
  // Default commands (used if not specified in config)
  defaultCommands: {
    composer: "composer install",
    npm: "npm install --legacy-peer-deps",
    gruntCss: "grunt css",
    gruntJs: "grunt js",
    npmBuild: "npm run build",
    gruntZip: "grunt zip",
  },
  commandChecks: {
    composer: "composer --version",
    npm: "npm --version",
    grunt: "grunt --version",
  },
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function colorLog(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, cwd, description) {
  try {
    colorLog(`  ${description}...`, "yellow");
    execSync(command, {
      cwd,
      stdio: "pipe",
      encoding: "utf8",
    });
    colorLog(`  ✅ ${description} completed`, "green");
    return { success: true, error: null };
  } catch (error) {
    colorLog(`  ❌ ${description} failed: ${error.message}`, "red");
    return { success: false, error: error.message };
  }
}

function execCommandRealtime(command, cwd, description) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    colorLog(`  ${description}...`, "yellow");

    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      if (code === 0) {
        colorLog(`  ✅ ${description} completed (${duration}s)`, "green");
        resolve({
          success: true,
          error: null,
          output,
          errorOutput,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          duration: duration,
        });
      } else {
        colorLog(
          `  ❌ ${description} failed with exit code ${code} (${duration}s)`,
          "red"
        );
        resolve({
          success: false,
          error: `Exit code ${code}`,
          output,
          errorOutput,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          duration: duration,
        });
      }
    });

    child.on("error", (error) => {
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      colorLog(
        `  ❌ ${description} failed: ${error.message} (${duration}s)`,
        "red"
      );
      resolve({
        success: false,
        error: error.message,
        output,
        errorOutput,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        duration: duration,
      });
    });
  });
}

function checkCommandExists(command) {
  try {
    execSync(command, { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

function getCurrentPHPVersion() {
  try {
    const output = execSync("php --version", { encoding: "utf8" });
    const match = output.match(/PHP (\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

function parseVersionRequirement(requirement) {
  // Parse composer.json require.php format like ">=7.4" or "^8.0"
  if (!requirement) return null;

  const cleanReq = requirement.replace(/[^\d\.\>\<\=\^\~\s]/g, "");

  // Handle different formats
  if (cleanReq.includes(">=")) {
    return cleanReq.replace(">=", "").trim();
  } else if (cleanReq.includes("^")) {
    const version = cleanReq.replace("^", "").trim();
    const parts = version.split(".");
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.0`;
    }
    return version;
  } else if (cleanReq.includes("~")) {
    const version = cleanReq.replace("~", "").trim();
    const parts = version.split(".");
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}.0`;
    }
    return version;
  }

  return cleanReq.trim();
}

function checkPHPVersionCompatibility(phpVersion, requiredVersion) {
  if (!phpVersion || !requiredVersion) return true; // Skip if can't determine

  const current = phpVersion.split(".").map(Number);
  const required = requiredVersion.split(".").map(Number);

  // Compare major.minor.patch
  for (let i = 0; i < Math.max(current.length, required.length); i++) {
    const curr = current[i] || 0;
    const req = required[i] || 0;

    if (curr > req) return true;
    if (curr < req) return false;
  }

  return true; // Equal versions
}

// Phase 1: Command Validation
async function validateCommands(plugins) {
  colorLog("\n🔍 PHASE 1: Command Validation", "blue");
  colorLog("================================", "blue");

  const validationResults = {
    globalCommands: {},
    pluginCommands: {},
    incompatiblePlugins: [],
  };

  // Check global commands
  colorLog("\n📋 Checking global commands...", "yellow");
  for (const [cmdName, cmdCheck] of Object.entries(CONFIG.commandChecks)) {
    const exists = checkCommandExists(cmdCheck);
    validationResults.globalCommands[cmdName] = exists;
    colorLog(
      `  ${exists ? "✅" : "❌"} ${cmdName}: ${
        exists ? "Available" : "Not found"
      }`,
      exists ? "green" : "red"
    );
  }

  // Check PHP version
  const currentPHPVersion = getCurrentPHPVersion();
  validationResults.globalCommands.phpVersion = currentPHPVersion;
  if (currentPHPVersion) {
    colorLog(`  ✅ PHP: ${currentPHPVersion}`, "green");
  } else {
    colorLog(`  ❌ PHP: Not found or version detection failed`, "red");
  }

  // Check plugin-specific commands
  colorLog("\n📋 Checking plugin-specific commands...", "yellow");
  for (const plugin of plugins) {
    const pluginPath = path.join(CONFIG.pluginsPath, plugin.name);
    validationResults.pluginCommands[plugin.name] = {};

    colorLog(`\n  🔍 Checking ${plugin.name}:`, "cyan");

    // Check if package.json exists
    const packageJsonPath = path.join(pluginPath, "package.json");
    const hasPackageJson = fs.existsSync(packageJsonPath);
    validationResults.pluginCommands[plugin.name].hasPackageJson =
      hasPackageJson;
    colorLog(
      `    ${hasPackageJson ? "✅" : "❌"} package.json: ${
        hasPackageJson ? "Found" : "Not found"
      }`,
      hasPackageJson ? "green" : "red"
    );

    // Check if composer.json exists and validate PHP version
    const composerJsonPath = path.join(pluginPath, "composer.json");
    const hasComposerJson = fs.existsSync(composerJsonPath);
    validationResults.pluginCommands[plugin.name].hasComposerJson =
      hasComposerJson;
    colorLog(
      `    ${hasComposerJson ? "✅" : "❌"} composer.json: ${
        hasComposerJson ? "Found" : "Not found"
      }`,
      hasComposerJson ? "green" : "red"
    );

    let phpVersionCompatible = true;
    if (hasComposerJson && currentPHPVersion) {
      try {
        const composerContent = fs.readFileSync(composerJsonPath, "utf8");
        const composerJson = JSON.parse(composerContent);

        // Check require.php, platform.php, and config.platform.php
        const phpRequirement =
          composerJson.require?.php ||
          composerJson.platform?.php ||
          composerJson.config?.platform?.php;
        const requirementSource = composerJson.require?.php
          ? "require"
          : composerJson.platform?.php
          ? "platform"
          : composerJson.config?.platform?.php
          ? "config.platform"
          : "";

        if (phpRequirement) {
          const requiredVersion = parseVersionRequirement(phpRequirement);
          phpVersionCompatible = checkPHPVersionCompatibility(
            currentPHPVersion,
            requiredVersion
          );
          validationResults.pluginCommands[plugin.name].phpRequirement =
            phpRequirement;
          validationResults.pluginCommands[plugin.name].phpRequirementSource =
            requirementSource;
          validationResults.pluginCommands[plugin.name].phpVersionCompatible =
            phpVersionCompatible;

          colorLog(
            `    ${
              phpVersionCompatible ? "✅" : "❌"
            } PHP requirement (${requirementSource}): ${phpRequirement} (current: ${currentPHPVersion})`,
            phpVersionCompatible ? "green" : "red"
          );
        } else {
          colorLog(
            `    ⚠️  PHP requirement: Not specified in require or platform`,
            "yellow"
          );
        }
      } catch (error) {
        colorLog(`    ❌ PHP requirement: Error reading composer.json`, "red");
        phpVersionCompatible = false;
      }
    }

    // Check if Gruntfile.js exists
    const gruntfilePath = path.join(pluginPath, "Gruntfile.js");
    const hasGruntfile = fs.existsSync(gruntfilePath);
    validationResults.pluginCommands[plugin.name].hasGruntfile = hasGruntfile;
    colorLog(
      `    ${hasGruntfile ? "✅" : "❌"} Gruntfile.js: ${
        hasGruntfile ? "Found" : "Not found"
      }`,
      hasGruntfile ? "green" : "red"
    );

    // Determine if plugin is compatible
    const isCompatible =
      validationResults.globalCommands.composer &&
      validationResults.globalCommands.npm &&
      validationResults.globalCommands.grunt &&
      validationResults.globalCommands.phpVersion &&
      hasPackageJson &&
      hasComposerJson &&
      hasGruntfile &&
      phpVersionCompatible;

    validationResults.pluginCommands[plugin.name].isCompatible = isCompatible;

    if (!isCompatible) {
      validationResults.incompatiblePlugins.push(plugin.name);
      colorLog(`    ❌ ${plugin.name} is NOT compatible`, "red");
    } else {
      colorLog(`    ✅ ${plugin.name} is compatible`, "green");
    }
  }

  // Summary
  colorLog("\n📊 VALIDATION SUMMARY", "blue");
  colorLog("====================", "blue");
  colorLog(
    `✅ Compatible plugins: ${
      plugins.length - validationResults.incompatiblePlugins.length
    }`,
    "green"
  );
  colorLog(
    `❌ Incompatible plugins: ${validationResults.incompatiblePlugins.length}`,
    "red"
  );

  if (validationResults.incompatiblePlugins.length > 0) {
    colorLog("\n🚫 Incompatible plugins:", "red");
    validationResults.incompatiblePlugins.forEach((plugin) => {
      colorLog(`  • ${plugin}`, "red");
    });
  }

  return validationResults;
}

// Phase 2: Real-time Building
async function buildPluginsRealtime(plugins, validationResults) {
  colorLog("\n🚀 PHASE 2: Real-time Building", "blue");
  colorLog("==============================", "blue");

  const buildResults = {
    startTime: new Date().toISOString(),
    plugins: {},
    summary: {
      total: 0,
      successful: 0,
      failed: 0,
    },
  };

  const compatiblePlugins = plugins.filter(
    (plugin) => validationResults.pluginCommands[plugin.name]?.isCompatible
  );

  buildResults.summary.total = compatiblePlugins.length;

  for (const plugin of compatiblePlugins) {
    const pluginResult = await buildPluginRealtime(plugin.path, plugin.name);
    buildResults.plugins[plugin.name] = pluginResult;

    if (pluginResult.success) {
      buildResults.summary.successful++;
    } else {
      buildResults.summary.failed++;
    }
  }

  buildResults.endTime = new Date().toISOString();
  buildResults.duration = Math.round(
    (new Date(buildResults.endTime) - new Date(buildResults.startTime)) / 1000
  );

  return buildResults;
}

async function buildPluginRealtime(pluginPath, pluginName) {
  colorLog(`\n🔨 Building: ${pluginName}`, "blue");
  colorLog(`📁 Path: ${pluginPath}`, "yellow");

  const pluginResult = {
    name: pluginName,
    path: pluginPath,
    startTime: new Date().toISOString(),
    steps: {},
    success: false,
    zipFile: null,
    error: null,
  };

  // Get build steps from config or use defaults
  let steps;
  if (CONFIG.customBuildSteps && CONFIG.customBuildSteps.length > 0) {
    // Use custom build steps from config, filtering out skipped steps
    steps = CONFIG.customBuildSteps
      .filter((step) => !step.skip) // Skip steps marked with skip: true
      .map((step, index) => ({
        key: step.name || `step_${index}`,
        cmd: step.command,
        desc: step.description || step.command,
      }));
    
    // Log skipped steps
    const skippedSteps = CONFIG.customBuildSteps.filter((step) => step.skip);
    if (skippedSteps.length > 0) {
      colorLog(`  ⏭️  Skipped ${skippedSteps.length} build steps:`, "yellow");
      skippedSteps.forEach((step) => {
        colorLog(`    • ${step.description || step.name || step.command}`, "yellow");
      });
    }
  } else {
    // Use default build steps
    steps = [
      {
        key: "composer",
        cmd: CONFIG.defaultCommands.composer,
        desc: "Composer install",
      },
      { key: "npm", cmd: CONFIG.defaultCommands.npm, desc: "NPM install" },
      {
        key: "gruntCss",
        cmd: CONFIG.defaultCommands.gruntCss,
        desc: "Grunt CSS",
      },
      { key: "gruntJs", cmd: CONFIG.defaultCommands.gruntJs, desc: "Grunt JS" },
      {
        key: "npmBuild",
        cmd: CONFIG.defaultCommands.npmBuild,
        desc: "NPM build",
      },
      {
        key: "gruntZip",
        cmd: CONFIG.defaultCommands.gruntZip,
        desc: "Grunt ZIP",
      },
    ];
  }

  for (const step of steps) {
    const stepResult = await execCommandRealtime(
      step.cmd,
      pluginPath,
      step.desc
    );
    pluginResult.steps[step.key] = {
      command: step.cmd,
      description: step.desc,
      success: stepResult.success,
      error: stepResult.error,
      output: stepResult.output,
      errorOutput: stepResult.errorOutput,
      startTime: stepResult.startTime,
      endTime: stepResult.endTime,
      duration: stepResult.duration,
    };

    // Continue with remaining steps even if grunt js or grunt css fails
    if (!stepResult.success) {
      if (step.key === "gruntJs" || step.key === "gruntCss") {
        const stepName = step.key === "gruntJs" ? "Grunt JS" : "Grunt CSS";
        colorLog(`  ⚠️  ${stepName} failed, but continuing with remaining steps...`, "yellow");
        pluginResult.error = stepResult.error; // Store the error but don't break
      } else {
        // For other steps, still break on failure
        pluginResult.error = stepResult.error;
        break;
      }
    }
  }

  // Move zip file to output directory (only if grunt zip step was executed)
  const zipFile = `${pluginName}.zip`;
  const sourceZipPath = path.join(pluginPath, zipFile);
  const destZipPath = path.join(CONFIG.outputDir, zipFile);

  // Check if grunt zip step was executed (not skipped)
  const gruntZipStepExecuted = steps.some(step => step.key === "gruntZip");

  if (gruntZipStepExecuted) {
    if (fs.existsSync(sourceZipPath)) {
      try {
        fs.copyFileSync(sourceZipPath, destZipPath);
        pluginResult.zipFile = destZipPath;
        colorLog(`  📦 Zip file moved to: ${destZipPath}`, "cyan");
        // Clean up original zip file
        fs.unlinkSync(sourceZipPath);
      } catch (error) {
        colorLog(
          `  ⚠️  Warning: Could not move zip file: ${error.message}`,
          "yellow"
        );
      }
    } else {
      colorLog(`  ⚠️  Warning: Zip file not found: ${zipFile}`, "yellow");
    }
  } else {
    colorLog(`  ⏭️  Zip file creation skipped (grunt zip step was skipped)`, "yellow");
  }

  pluginResult.endTime = new Date().toISOString();
  
  // Determine success: build is successful if no critical errors occurred
  // Grunt JS and Grunt CSS failures are not considered critical errors
  const gruntJsFailed = pluginResult.steps.gruntJs?.success === false;
  const gruntCssFailed = pluginResult.steps.gruntCss?.success === false;
  const hasCriticalError = pluginResult.error && !gruntJsFailed && !gruntCssFailed;
  pluginResult.success = !hasCriticalError;

  // Calculate total plugin build duration
  pluginResult.totalDuration = Math.round(
    (new Date(pluginResult.endTime) - new Date(pluginResult.startTime)) / 1000
  );

  if (pluginResult.success) {
    colorLog(
      `  🎉 ${pluginName} built successfully! (Total: ${pluginResult.totalDuration}s)`,
      "green"
    );
  } else {
    colorLog(
      `  ❌ ${pluginName} build failed! (Total: ${pluginResult.totalDuration}s)`,
      "red"
    );
  }

  return pluginResult;
}

// Phase 3: Result Reporting
function generateResultReport(validationResults, buildResults) {
  colorLog("\n📋 PHASE 3: Result Report", "blue");
  colorLog("==========================", "blue");

  const timestamp = new Date().toLocaleString();
  const totalPlugins = Object.keys(validationResults.pluginCommands).length;
  const compatiblePlugins =
    totalPlugins - validationResults.incompatiblePlugins.length;
  const incompatiblePlugins = validationResults.incompatiblePlugins.length;

  // Safely handle buildResults
  const builtSuccessfully = buildResults?.summary?.successful || 0;
  const buildFailed = buildResults?.summary?.failed || 0;
  const buildDuration = buildResults?.duration || 0;

  // Format build duration in hours, minutes, seconds
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  const formattedDuration = formatDuration(buildDuration);

  // Format start time for markdown report
  const markdownStartTime = buildResults?.startTime
    ? new Date(buildResults.startTime).toLocaleString()
    : "Unknown";

  // Generate Markdown report
  let markdownReport = `# Plugin Build Report

**Started:** ${markdownStartTime}  
**Completed:** ${timestamp}  
**Build Duration:** ${formattedDuration}

## 📊 Summary

| Metric | Count |
|--------|-------|
| Total Plugins | ${totalPlugins} |
| Compatible Plugins | ${compatiblePlugins} |
| Incompatible Plugins | ${incompatiblePlugins} |
| Built Successfully | ${builtSuccessfully} |
| Build Failed | ${buildFailed} |
| Success Rate | ${
    compatiblePlugins > 0
      ? Math.round((builtSuccessfully / compatiblePlugins) * 100)
      : 0
  }% |

## 🔍 Validation Results

### Global Commands
| Command | Status | Version |
|---------|--------|---------|
| Composer | ${
    validationResults.globalCommands.composer ? "✅ Available" : "❌ Not Found"
  } | ${validationResults.globalCommands.composer ? "Installed" : "N/A"} |
| NPM | ${
    validationResults.globalCommands.npm ? "✅ Available" : "❌ Not Found"
  } | ${validationResults.globalCommands.npm ? "Installed" : "N/A"} |
| Grunt | ${
    validationResults.globalCommands.grunt ? "✅ Available" : "❌ Not Found"
  } | ${validationResults.globalCommands.grunt ? "Installed" : "N/A"} |
| PHP | ${
    validationResults.globalCommands.phpVersion
      ? "✅ Available"
      : "❌ Not Found"
  } | ${validationResults.globalCommands.phpVersion || "N/A"} |

### Plugin Compatibility

`;

  // Add plugin compatibility details
  Object.entries(validationResults.pluginCommands).forEach(
    ([pluginName, pluginData]) => {
      const status = pluginData.isCompatible
        ? "✅ Compatible"
        : "❌ Incompatible";
      const phpReq = pluginData.phpRequirement || "Not specified";
      const phpSource = pluginData.phpRequirementSource || "";
      const phpCompat =
        pluginData.phpVersionCompatible !== undefined
          ? pluginData.phpVersionCompatible
            ? "✅"
            : "❌"
          : "⚠️";

      markdownReport += `#### ${pluginName}
- **Status:** ${status}
- **package.json:** ${pluginData.hasPackageJson ? "✅ Found" : "❌ Missing"}
- **composer.json:** ${pluginData.hasComposerJson ? "✅ Found" : "❌ Missing"}
- **Gruntfile.js:** ${pluginData.hasGruntfile ? "✅ Found" : "❌ Missing"}
- **PHP Requirement:** ${phpReq} ${
        phpSource ? `(${phpSource})` : ""
      } ${phpCompat}
- **PHP Compatible:** ${
        pluginData.phpVersionCompatible !== undefined
          ? pluginData.phpVersionCompatible
            ? "✅ Yes"
            : "❌ No"
          : "⚠️ Unknown"
      }

`;
    }
  );

  // Add build results
  markdownReport += `## 🚀 Build Results

`;

  if (Object.keys(buildResults.plugins).length > 0) {
    Object.entries(buildResults.plugins).forEach(
      ([pluginName, pluginResult]) => {
        const status = pluginResult.success ? "✅ Success" : "❌ Failed";
        const duration = Math.round(
          (new Date(pluginResult.endTime) - new Date(pluginResult.startTime)) /
            1000
        );
        const pluginFormattedDuration = formatDuration(duration);

        markdownReport += `### ${pluginName}
- **Status:** ${status}
- **Total Duration:** ${pluginFormattedDuration} (from composer install to grunt zip)
- **Zip File:** ${
          pluginResult.zipFile ? `✅ ${pluginResult.zipFile}` : "❌ Not created"
        }
- **Error:** ${pluginResult.error || "None"}

#### Build Steps Timing
`;

        Object.entries(pluginResult.steps).forEach(([stepName, stepData]) => {
          const stepStatus = stepData.success ? "✅" : "❌";
          const stepDuration = stepData.duration
            ? ` (${stepData.duration}s)`
            : "";
          markdownReport += `- **${stepData.description}:** ${stepStatus} ${
            stepData.success ? "Completed" : "Failed"
          }${stepDuration}\n`;
          if (!stepData.success && stepData.error) {
            markdownReport += `  - Error: ${stepData.error}\n`;
          }
        });

        markdownReport += "\n";
      }
    );
  } else {
    markdownReport += `No plugins were built (all were incompatible).

`;
  }

  // Add incompatible plugins section
  if (validationResults.incompatiblePlugins.length > 0) {
    markdownReport += `## ❌ Incompatible Plugins

The following plugins could not be built due to compatibility issues:

`;
    validationResults.incompatiblePlugins.forEach((plugin) => {
      markdownReport += `- ${plugin}\n`;
    });
    markdownReport += "\n";
  }

  // Add performance analysis section
  if (Object.keys(buildResults.plugins).length > 0) {
    markdownReport += `## 📊 Performance Analysis

### Plugin Build Times Comparison
`;

    // Sort plugins by build time for analysis
    const pluginTimes = Object.entries(buildResults.plugins)
      .map(([name, result]) => ({
        name,
        duration: result.totalDuration || 0,
        success: result.success,
      }))
      .sort((a, b) => b.duration - a.duration);

    pluginTimes.forEach((plugin, index) => {
      const status = plugin.success ? "✅" : "❌";
      const formattedDuration = formatDuration(plugin.duration);
      markdownReport += `${index + 1}. **${
        plugin.name
      }:** ${status} ${formattedDuration}\n`;
    });

    // Calculate statistics
    const successfulPlugins = pluginTimes.filter((p) => p.success);
    const totalTime = pluginTimes.reduce((sum, p) => sum + p.duration, 0);
    const avgTime =
      successfulPlugins.length > 0
        ? Math.round(totalTime / successfulPlugins.length)
        : 0;
    const fastestPlugin =
      successfulPlugins.length > 0
        ? successfulPlugins[successfulPlugins.length - 1]
        : null;
    const slowestPlugin =
      successfulPlugins.length > 0 ? successfulPlugins[0] : null;

    markdownReport += `
### Performance Statistics
- **Total Build Time:** ${formatDuration(totalTime)}
- **Average Build Time:** ${formatDuration(avgTime)}
- **Fastest Plugin:** ${
      fastestPlugin
        ? `${fastestPlugin.name} (${formatDuration(fastestPlugin.duration)})`
        : "N/A"
    }
- **Slowest Plugin:** ${
      slowestPlugin
        ? `${slowestPlugin.name} (${formatDuration(slowestPlugin.duration)})`
        : "N/A"
    }

### Step Timing Analysis
`;

    // Analyze step timings across all plugins
    const stepStats = {};
    Object.values(buildResults.plugins).forEach((plugin) => {
      Object.entries(plugin.steps).forEach(([stepName, stepData]) => {
        if (!stepStats[stepName]) {
          stepStats[stepName] = {
            name: stepData.description,
            times: [],
            successes: 0,
            failures: 0,
          };
        }
        if (stepData.duration) {
          stepStats[stepName].times.push(stepData.duration);
        }
        if (stepData.success) {
          stepStats[stepName].successes++;
        } else {
          stepStats[stepName].failures++;
        }
      });
    });

    Object.entries(stepStats).forEach(([stepName, stats]) => {
      const avgTime =
        stats.times.length > 0
          ? Math.round(
              stats.times.reduce((a, b) => a + b, 0) / stats.times.length
            )
          : 0;
      const maxTime = stats.times.length > 0 ? Math.max(...stats.times) : 0;
      const minTime = stats.times.length > 0 ? Math.min(...stats.times) : 0;

      markdownReport += `- **${stats.name}:** Avg: ${avgTime}s, Min: ${minTime}s, Max: ${maxTime}s (${stats.successes}✅/${stats.failures}❌)\n`;
    });

    markdownReport += "\n";
  }

  // Add file locations
  markdownReport += `## 📁 Output Files

- **Zip Files:** ${path.resolve(CONFIG.outputDir)}
- **Report File:** ${path.resolve(CONFIG.outputDir, CONFIG.resultFile)}

## 🔧 Build Configuration

- **Plugins Path:** ${path.resolve(CONFIG.pluginsPath)}
- **Output Directory:** ${path.resolve(CONFIG.outputDir)}
- **Build Steps:** ${CONFIG.customBuildSteps ? "Custom" : "Default"}

---

*Report generated by Plugin Build Automation System*
`;

  // Save Markdown report in build-output directory only
  const outputReportPath = path.resolve(CONFIG.outputDir, CONFIG.resultFile);
  try {
    fs.writeFileSync(outputReportPath, markdownReport);
    colorLog(`📄 Markdown report saved to: ${outputReportPath}`, "green");
  } catch (error) {
    colorLog(`❌ Error saving result report: ${error.message}`, "red");
  }

  // Calculate success rate
  const successRate =
    compatiblePlugins > 0
      ? Math.round((builtSuccessfully / compatiblePlugins) * 100)
      : 0;

  // Display summary in table format
  colorLog("\n📊 FINAL SUMMARY", "blue");
  colorLog("================", "blue");

  // Format start time for display
  const startTimeFormatted = buildResults?.startTime
    ? new Date(buildResults.startTime).toLocaleString()
    : "Unknown";

  // Create table data with optimized values
  const tableData = [
    ["📅 Started at", startTimeFormatted],
    ["📅 Completed at", timestamp],
    ["📦 Total plugins", totalPlugins.toString()],
    ["✅ Compatible plugins", compatiblePlugins.toString()],
    ["❌ Incompatible plugins", incompatiblePlugins.toString()],
    ["🚀 Built successfully", builtSuccessfully.toString()],
    ["💥 Build failed", buildFailed.toString()],
    ["📈 Success rate", `${successRate}%`],
    ["⏱️  Total build time", formattedDuration],
    ["📁 Zip files location", path.basename(CONFIG.outputDir)],
    ["📄 Report file", "build-results.md"],
  ];

  // Calculate column widths
  const maxLabelWidth = Math.max(...tableData.map((row) => row[0].length));
  const maxValueWidth = Math.max(...tableData.map((row) => row[1].length));

  // Draw table
  const tableWidth = maxLabelWidth + maxValueWidth + 7; // +7 for borders and padding
  colorLog("┌" + "─".repeat(tableWidth - 2) + "┐", "blue");

  tableData.forEach((row, index) => {
    const [label, value] = row;
    const paddedLabel = label.padEnd(maxLabelWidth);
    const paddedValue = value.padEnd(maxValueWidth);

    // Color coding for different rows
    let rowColor = "white";
    if (label.includes("✅") || label.includes("🚀")) rowColor = "green";
    if (label.includes("❌") || label.includes("💥")) rowColor = "red";
    if (label.includes("📈"))
      rowColor =
        successRate === 100 ? "green" : successRate >= 80 ? "yellow" : "red";
    if (label.includes("⏱️")) rowColor = "yellow";
    if (
      label.includes("📅") ||
      label.includes("📦") ||
      label.includes("📁") ||
      label.includes("📄")
    )
      rowColor = "cyan";

    colorLog(`│ ${paddedLabel} │ ${paddedValue} │`, rowColor);
  });

  colorLog("└" + "─".repeat(tableWidth - 2) + "┘", "blue");

  // Show detailed file paths below the table
  colorLog("\n📁 File Locations:", "cyan");
  colorLog(`  • Zip files: ${path.resolve(CONFIG.outputDir)}`, "cyan");
  colorLog(`  • Report: ${outputReportPath}`, "cyan");

  return {
    timestamp,
    totalPlugins,
    compatiblePlugins,
    incompatiblePlugins,
    builtSuccessfully,
    buildFailed,
    buildDuration,
  };
}

function getPluginDirectories(pluginList = null, ignoreList = []) {
  const pluginsDir = path.resolve(CONFIG.pluginsPath);

  if (!fs.existsSync(pluginsDir)) {
    throw new Error(`Plugins directory not found: ${pluginsDir}`);
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  let filteredEntries = entries.filter(
    (entry) => entry.isDirectory() && CONFIG.pluginPattern.test(entry.name)
  );

  // Apply ignore list first
  if (ignoreList && ignoreList.length > 0) {
    const beforeIgnore = filteredEntries.length;
    filteredEntries = filteredEntries.filter((entry) => 
      !ignoreList.includes(entry.name)
    );
    const afterIgnore = filteredEntries.length;
    if (beforeIgnore !== afterIgnore) {
      colorLog(`🚫 Ignored ${beforeIgnore - afterIgnore} plugins:`, "yellow");
      ignoreList.forEach((plugin) => {
        if (entries.some(entry => entry.name === plugin)) {
          colorLog(`  • ${plugin}`, "yellow");
        }
      });
    }
  }

  // If plugin list is provided and not empty, filter to only those plugins
  if (pluginList && pluginList.length > 0) {
    filteredEntries = filteredEntries.filter((entry) =>
      pluginList.includes(entry.name)
    );

    // Additional validation: ensure all plugins in the list exist and have correct prefix
    const missingPlugins = pluginList.filter(
      (plugin) => !filteredEntries.some((entry) => entry.name === plugin)
    );

    if (missingPlugins.length > 0) {
      colorLog(`❌ Plugins not found in directory:`, "red");
      missingPlugins.forEach((plugin) => colorLog(`  • ${plugin}`, "red"));
      colorLog(
        `💡 Make sure the plugin directories exist and have the correct 'user-registration-' prefix`,
        "yellow"
      );
      throw new Error(`Missing plugins: ${missingPlugins.join(", ")}`);
    }
    
    colorLog(`📋 Processing ${filteredEntries.length} specified plugins:`, "blue");
    filteredEntries.forEach((entry) => colorLog(`  • ${entry.name}`, "yellow"));
  } else {
    // If no specific plugins listed, process all plugins (except ignored ones)
    colorLog(`📋 Processing all plugins (${filteredEntries.length} found, ${ignoreList.length} ignored):`, "blue");
    filteredEntries.forEach((entry) => colorLog(`  • ${entry.name}`, "yellow"));
  }

  return filteredEntries.map((entry) => ({
    name: entry.name,
    path: path.join(pluginsDir, entry.name),
  }));
}

function loadPluginList() {
  const listPath = path.resolve(CONFIG.pluginListFile);

  if (!fs.existsSync(listPath)) {
    colorLog(
      `⚠️  Plugin list file not found: ${CONFIG.pluginListFile}`,
      "yellow"
    );
    colorLog(`📝 Creating example plugin list file...`, "yellow");
    createExamplePluginList();
    return null;
  }

  try {
    const content = fs.readFileSync(listPath, "utf8");
    const config = JSON.parse(content);

    // Get plugins array and ignore array
    const plugins = config.plugins || [];
    const ignoreList = config.ignore || [];

    // Validate plugin names
    const invalidPlugins = plugins.filter(
      (plugin) => !plugin.startsWith("user-registration-")
    );
    if (invalidPlugins.length > 0) {
      colorLog(
        `❌ Invalid plugin names found (must start with 'user-registration-'):`,
        "red"
      );
      invalidPlugins.forEach((plugin) => colorLog(`  • ${plugin}`, "red"));
      colorLog(
        `💡 Please fix the plugin names in ${CONFIG.pluginListFile}`,
        "yellow"
      );
      return null;
    }

    // Validate ignore list names
    const invalidIgnorePlugins = ignoreList.filter(
      (plugin) => !plugin.startsWith("user-registration-")
    );
    if (invalidIgnorePlugins.length > 0) {
      colorLog(
        `❌ Invalid ignore plugin names found (must start with 'user-registration-'):`,
        "red"
      );
      invalidIgnorePlugins.forEach((plugin) => colorLog(`  • ${plugin}`, "red"));
      colorLog(
        `💡 Please fix the ignore plugin names in ${CONFIG.pluginListFile}`,
        "yellow"
      );
      return null;
    }

    // Store custom build steps if specified
    CONFIG.customBuildSteps = config.buildSettings?.buildSteps || null;

    // Update output directory if specified
    if (config.buildSettings?.outputDirectory) {
      CONFIG.outputDir = config.buildSettings.outputDirectory;
    }

    if (plugins.length > 0) {
      colorLog(
        `📋 Loaded ${plugins.length} plugins from ${CONFIG.pluginListFile}:`,
        "blue"
      );
      plugins.forEach((plugin) => colorLog(`  • ${plugin}`, "yellow"));
    } else {
      colorLog(
        `📋 No specific plugins listed - will process all plugins (except ignored ones)`,
        "blue"
      );
    }

    if (ignoreList.length > 0) {
      colorLog(
        `🚫 Ignore list (${ignoreList.length} plugins):`,
        "yellow"
      );
      ignoreList.forEach((plugin) => colorLog(`  • ${plugin}`, "yellow"));
    }

    return { plugins, ignoreList };
  } catch (error) {
    colorLog(`❌ Error reading plugin list: ${error.message}`, "red");
    return null;
  }
}

function createExamplePluginList() {
  const exampleConfig = {
    description: "Plugin list for automated building",
    version: "1.0.0",
    plugins: [
      "user-registration-pro",
      "user-registration-activecampaign",
      "user-registration-advanced-fields",
    ],
    ignore: [
      "user-registration-stripe",
      "user-registration-mailchimp",
    ],
    buildSettings: {
      outputDirectory: "build-output",
      buildSteps: [
        {
          name: "composer",
          command: "composer install --no-dev --optimize-autoloader",
          description: "Composer install",
          skip: false,
        },
        {
          name: "npm",
          command: "npm install --legacy-peer-deps",
          description: "NPM install",
          skip: false,
        },
        {
          name: "gruntCss",
          command: "grunt css",
          description: "Grunt CSS",
          skip: false,
        },
        {
          name: "gruntJs",
          command: "grunt js",
          description: "Grunt JS",
          skip: false,
        },
        {
          name: "npmBuild",
          command: "npm run build",
          description: "NPM build",
          skip: false,
        },
        {
          name: "gruntZip",
          command: "grunt zip",
          description: "Grunt ZIP",
          skip: false,
        },
      ],
    },
  };

  try {
    fs.writeFileSync(
      CONFIG.pluginListFile,
      JSON.stringify(exampleConfig, null, 2)
    );
    colorLog(
      `✅ Created example plugin list file: ${CONFIG.pluginListFile}`,
      "green"
    );
    colorLog(`📝 Edit this file to specify which plugins to build`, "yellow");
  } catch (error) {
    colorLog(`❌ Error creating plugin list file: ${error.message}`, "red");
  }
}

function setupOutputDirectory() {
  const outputPath = path.resolve(CONFIG.outputDir);

  if (!fs.existsSync(outputPath)) {
    try {
      fs.mkdirSync(outputPath, { recursive: true });
      colorLog(`📁 Created output directory: ${outputPath}`, "green");
    } catch (error) {
      colorLog(`❌ Error creating output directory: ${error.message}`, "red");
      throw error;
    }
  } else {
    colorLog(`📁 Using output directory: ${outputPath}`, "blue");
  }
}

async function main() {
  try {
    colorLog("🚀 Starting 3-Phase Plugin Build Process", "blue");
    colorLog("==========================================", "blue");
    colorLog(`📅 Started at: ${new Date().toLocaleString()}`, "yellow");

    // Setup output directory
    setupOutputDirectory();

    // Load plugin list
    const pluginConfig = loadPluginList();

    if (!pluginConfig) {
      colorLog("❌ Failed to load plugin configuration", "red");
      process.exit(1);
    }

    // Get plugins to build
    const plugins = getPluginDirectories(pluginConfig.plugins, pluginConfig.ignoreList);

    if (plugins.length === 0) {
      colorLog("❌ No plugins found to build", "red");
      if (!pluginConfig.plugins || pluginConfig.plugins.length === 0) {
        colorLog(
          "💡 Edit the plugin-list.json file to specify which plugins to build, or add plugins to the ignore list",
          "yellow"
        );
      }
      process.exit(1);
    }

    colorLog(`📋 Found ${plugins.length} plugins to process:`, "blue");
    plugins.forEach((plugin) => {
      colorLog(`  • ${plugin.name}`, "yellow");
    });

    // Phase 1: Command Validation
    const validationResults = await validateCommands(plugins);

    // Phase 2: Real-time Building
    const buildResults = await buildPluginsRealtime(plugins, validationResults);

    // Phase 3: Result Reporting
    const finalReport = generateResultReport(validationResults, buildResults);

    // Final exit status
    if (finalReport.buildFailed > 0) {
      colorLog(
        "\n⚠️  Some builds failed. Check the result report for details.",
        "red"
      );
      process.exit(1);
    } else {
      colorLog("\n🎉 All compatible plugins built successfully!", "green");
      colorLog(
        `📦 Zip files are ready in the ${CONFIG.outputDir} directory`,
        "green"
      );
      process.exit(0);
    }
  } catch (error) {
    colorLog(`❌ Fatal error: ${error.message}`, "red");
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node plugin-builder.js [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version information

This script runs a 3-phase process:

PHASE 1: Command Validation
- Checks if composer, npm, and grunt are available globally
- Validates each plugin has required files (package.json, composer.json, Gruntfile.js)
- Reports incompatible plugins that cannot be built

PHASE 2: Real-time Building
- Builds compatible plugins with real-time output
- Runs: composer install → npm install → grunt css → grunt js → npm run build → grunt zip
- Shows live progress and output for each command
- Creates zip files and moves them to build-output directory

PHASE 3: Result Reporting
- Generates comprehensive build-results.md report
- Contains validation results, build logs, and summary statistics
- Shows final summary with success/failure counts

The script will:
- Read plugin configuration from 'plugin-list.json' file
- Validate all plugin names start with 'user-registration-' prefix
- Build only compatible plugins listed in the 'plugins' array
- Support skipping individual build steps via configuration
- Generate detailed result reports for analysis

If plugin-list.json doesn't exist, an example file will be created.

Make sure you have composer, npm, and grunt-cli installed globally.
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log("1.0.0");
  process.exit(0);
}

// Run the main function
main();
