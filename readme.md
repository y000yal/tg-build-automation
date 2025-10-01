# Plugin Build Automation

This directory contains a cross-platform automation script to build selected User Registration plugins with a single command, eliminating the need to manually run `composer install`, `npm install`, `grunt css`, `grunt js`, `npm run build`, and `grunt zip` for each plugin. The script creates zip files for distribution and organizes them in an output folder.

## Quick Start

**1. Navigate to the build automation folder:**
```bash
cd wp-content/plugins/build-automation
```

**2. Edit the plugin list:**
```bash
# Edit plugin-list.json to select which plugins to build
nano plugin-list.json  # or use any text editor
```

**3. Run the script:**
```bash
# Build selected plugins and create zip files
node build-all-plugins.js
```

**4. Find your zip files:**
```bash
# All zip files will be in the build-output directory
ls build-output/
```

## Available Script

### Node.js Script (Cross-platform)
**File:** `build-all-plugins.js`

**Usage:**
```bash
# Build selected plugins (reads from plugin-list.json)
node build-all-plugins.js

# Show help
node build-all-plugins.js --help

# Show version
node build-all-plugins.js --version
```

**Features:**
- ✅ **Cross-platform** (Windows, macOS, Linux)
- ✅ **3-Phase Process** - validation, real-time building, result reporting
- ✅ **Command validation** - checks if all required tools are available
- ✅ **Real-time output** - see live progress and output from each command
- ✅ **Comprehensive reporting** - detailed JSON report with all build information
- ✅ **Selective building** - only builds compatible plugins from your enabled list
- ✅ **Automatic zip creation** - runs `grunt zip` for each plugin
- ✅ **Organized output** - saves all zip files to `build-output` folder
- ✅ **JSON configuration** - structured plugin list with enabled/disabled sections
- ✅ **Skip build steps** - configure which steps to skip per build
- ✅ **Colored console output** for better readability
- ✅ **Auto-creates example plugin list** if none exists

## Prerequisites

Before using the script, ensure you have the following installed:

1. **Composer** - PHP dependency manager
2. **Node.js** - JavaScript runtime
3. **NPM** - Node package manager
4. **Grunt CLI** - Install globally with `npm install -g grunt-cli`

## 3-Phase Process

### **PHASE 1: Command Validation** 🔍
- **Global Commands**: Checks if `composer`, `npm`, `grunt`, and `php` are available
- **PHP Version**: Validates current PHP version against plugin requirements from `composer.json`
- **Plugin Files**: Validates each plugin has required files:
  - `package.json` - Node.js dependencies
  - `composer.json` - PHP dependencies  
  - `Gruntfile.js` - Build configuration
- **Compatibility Report**: Lists which plugins can/cannot be built
- **Early Detection**: Identifies issues before building starts

### **PHASE 2: Real-time Building** 🚀
For each compatible plugin, runs the full build sequence with live output:

1. **Composer Install** - Install PHP dependencies
   ```bash
   composer install --no-dev --optimize-autoloader
   ```

2. **NPM Install** - Install Node.js dependencies
   ```bash
   npm install
   ```

3. **Grunt CSS** - Compile and minify CSS
   ```bash
   grunt css
   ```

4. **Grunt JS** - Minify JavaScript
   ```bash
   grunt js
   ```

5. **NPM Build** - Run the build script
   ```bash
   npm run build
   ```

6. **Grunt ZIP** - Create distribution zip file
   ```bash
   grunt zip
   ```

### **PHASE 3: Result Reporting** 📋
- **Comprehensive Report**: Generates `build-results.md` with:
  - Validation results for all plugins
  - Detailed build logs for each step
  - Success/failure status
  - Timing information
  - Error messages and output
  - PHP version compatibility details
- **Summary Statistics**: Total plugins, compatible plugins, build success rate
- **File Organization**: All zip files moved to `build-output` directory
- **Human-Readable Format**: Markdown report for easy viewing and sharing

## Plugin Selection

The script reads plugin configuration from `plugin-list.json` file. This allows you to:

- **Select specific plugins** to build (in the `plugins` array)
- **Configure build settings** like output directory and custom build steps
- **Easily manage** which plugins to include in each release
- **Customize build process** with your own commands and order

### **Plugin Name Validation** ✅
- **Required prefix**: All plugin names must start with `user-registration-`
- **Automatic validation**: Script checks plugin names before processing
- **Error reporting**: Invalid plugin names are reported with clear error messages
- **Directory validation**: Ensures plugin directories exist in the file system

### **Configurable Build Steps** ⚙️
- **Custom commands**: Define your own build commands in any order
- **Flexible order**: Run commands in the exact sequence you specify
- **Add any command**: Include custom scripts, tests, or other build steps
- **Skip steps**: Remove steps you don't need
- **Descriptive names**: Give each step a meaningful name and description

**Example custom build steps:**
```json
"buildSteps": [
  {
    "name": "clean",
    "command": "rm -rf node_modules vendor",
    "description": "Clean dependencies"
  },
  {
    "name": "composer",
    "command": "composer install --no-dev --optimize-autoloader",
    "description": "Composer install"
  },
  {
    "name": "npm",
    "command": "npm install",
    "description": "NPM install"
  },
  {
    "name": "test",
    "command": "npm run test",
    "description": "Run tests"
  },
  {
    "name": "gruntCss",
    "command": "grunt css",
    "description": "Grunt CSS"
  },
  {
    "name": "gruntJs",
    "command": "grunt js",
    "description": "Grunt JS"
  },
  {
    "name": "npmBuild",
    "command": "npm run build",
    "description": "NPM build"
  },
  {
    "name": "gruntZip",
    "command": "grunt zip",
    "description": "Grunt ZIP"
  }
]
```

**Example plugin-list.json:**
```json
{
  "description": "Plugin list for automated building",
  "version": "1.0.0",
  "plugins": [
    "user-registration-pro",
    "user-registration-activecampaign",
    "user-registration-advanced-fields"
  ],
  "buildSettings": {
    "outputDirectory": "build-output",
    "buildSteps": [
      {
        "name": "composer",
        "command": "composer install --no-dev --optimize-autoloader",
        "description": "Composer install"
      },
      {
        "name": "npm",
        "command": "npm install",
        "description": "NPM install"
      },
      {
        "name": "gruntCss",
        "command": "grunt css",
        "description": "Grunt CSS"
      },
      {
        "name": "gruntJs",
        "command": "grunt js",
        "description": "Grunt JS"
      },
      {
        "name": "npmBuild",
        "command": "npm run build",
        "description": "NPM build"
      },
      {
        "name": "gruntZip",
        "command": "grunt zip",
        "description": "Grunt ZIP"
      }
    ]
  }
}
```

**Available plugins include:**
- `user-registration-pro`
- `user-registration-activecampaign`
- `user-registration-advanced-fields`
- `user-registration-authorize-net`
- And all other User Registration plugins...

## Zip File Output

The script automatically:

1. **Runs `grunt zip`** for each plugin after building
2. **Creates zip files** in each plugin directory
3. **Moves zip files** to the `build-output` directory
4. **Cleans up** original zip files from plugin directories
5. **Organizes all zip files** in one location for easy distribution

**Output structure:**
```
build-output/
├── user-registration-pro.zip
├── user-registration-activecampaign.zip
├── user-registration-advanced-fields.zip
└── ... (all other plugin zip files)
```

## Error Handling

The script includes comprehensive error handling:
- ✅ Stop on first error in each plugin
- ✅ Continue with remaining plugins
- ✅ Provide detailed error messages
- ✅ Show final success/failure summary

## Performance

The script provides timing information to help you understand build performance.

## Troubleshooting

### Common Issues

1. **"composer not found"**
   - Install Composer globally or add it to your PATH

2. **"npm not found"**
   - Install Node.js and NPM

3. **"grunt not found"**
   - Install Grunt CLI: `npm install -g grunt-cli`

4. **Permission errors**
   - Run PowerShell as Administrator
   - Check file permissions in plugin directories

### Getting Help

- Script: `node build-all-plugins.js --help`

## Customization

You can modify the script to:
- Change the plugin pattern
- Add additional build steps
- Modify command parameters
- Add custom error handling
- Include additional plugins

## Integration with CI/CD

The script can be easily integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Build selected plugins
  run: node build-all-plugins.js
```

```bash
# Jenkins example
node build-all-plugins.js
```

The script is ready to use and will work on any system with Node.js installed!
