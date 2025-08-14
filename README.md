# n8n Cloud CI/CD with Backup & Restore

A comprehensive CI/CD solution for managing n8n workflows in a single Cloud instance using environment suffixes (`-dev`, `-prod`) with version control, automated deployments, and robust backup/restore capabilities.

## 🌟 Features

- **🎯 Selective Workflow Management**: Choose exactly which workflows to export, sync, or restore
- **🔄 Environment Suffixes**: Clean separation using `-dev` and `-prod` workflow naming
- **💾 Comprehensive Backup System**: Automatic backups, manual backups, and emergency restore
- **🤖 GitHub Actions Integration**: Automated deployments with approval workflows
- **🎮 Interactive CLI Tools**: User-friendly command-line interface for all operations
- **🛡️ Safety First**: Automatic pre-sync backups
- **📊 Workflow Validation**: Built-in validation and comparison tools
- **💰 Cost Effective**: Single n8n Cloud instance instead of multiple environments

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Daily Usage](#daily-usage)
- [Command Reference](#command-reference)
- [GitHub Actions](#github-actions)
- [Backup & Restore](#backup--restore)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Advanced Features](#advanced-features)

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone <your-repo>
cd n8n-workflows
npm install
```

### 2. Configure Your n8n Instance
```bash
# Copy and edit environment configuration
cp .env.example .env
```

Edit `.env` file:
```env
N8N_API_KEY=your-n8n-api-key
```

Edit `config/n8n-config.json`:
```json
{
  "n8n": {
    "baseUrl": "https://yourcompany.app.n8n.cloud",
    "webhookUrl": "https://yourcompany.app.n8n.cloud/webhook"
  }
}
```

### 3. Define Your Workflows
Edit `config/managed-workflows.json` to list your workflows:
```json
{
  "managedWorkflows": [
    {
      "baseName": "Customer Onboarding",
      "description": "New customer welcome automation",
      "environments": ["dev", "prod"]
    }
  ]
}
```

### 4. Test Connection
```bash
npm run workflows:status
```

### 5. Start Using!
```bash
# Interactive mode (recommended for beginners)
npm run interactive

# Or use individual commands
npm run workflows:export:dev
npm run workflows:deploy "Customer Onboarding"
```

## 📚 Prerequisites

### n8n Cloud Requirements
- **Paid n8n Cloud subscription** (API access not available on free trial)
- Admin access to your n8n Cloud instance
- Workflows following naming convention: `Base Name-dev`, `Base Name-prod`

### Development Environment
- Node.js 18 or higher
- Git for version control
- GitHub repository with Actions enabled

### GitHub Setup
Create these secrets in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description | Example |
|--------|-------------|---------|
| `N8N_API_KEY` | n8n Cloud API key | `n8n_api_xxx...` |

Create these variables in your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description                          | Example                 |
|--------|--------------------------------------|-------------------------|
| `PRODUCTION_APPROVERS` | comma-separated list of GitHub users | `SuperUser,SomeoneElse` |
| `EMERGENCY_APPROVERS` | comma-separated list of GitHub users | `SuperUser,SomeoneElse` |

## 🛠️ Installation

### Step 1: Get n8n API Key

1. Log into your n8n Cloud instance
2. Go to **Settings** → **n8n API**
3. Click **"Create an API key"**
4. Set label: "CI/CD System"
5. Set expiration: 1 year
6. **Copy the key immediately** (you won't see it again!)

### Step 2: Repository Setup

```bash
# Clone this repository
git clone <your-repo-url>
cd n8n-workflows

# Install dependencies
npm install

# Create configuration files
cp config/n8n-config.json.example config/n8n-config.json
cp config/managed-workflows.json.example config/managed-workflows.json
```

### Step 3: Configure Your Setup

Edit `config/n8n-config.json`:
```json
{
  "n8n": {
    "baseUrl": "https://yourcompany.app.n8n.cloud",
    "webhookUrl": "https://yourcompany.app.n8n.cloud/webhook"
  }
}
```

Edit `config/managed-workflows.json`:
```json
{
  "managedWorkflows": [
    {
      "baseName": "Customer Onboarding",
      "description": "Automated new customer welcome sequence",
      "environments": ["dev", "prod"]
    },
    {
      "baseName": "Email Marketing",
      "description": "Email campaign automation",
      "environments": ["dev", "prod"]
    }
  ],
  "settings": {
    "backupBeforeDeploy": true
  }
}
```

### Step 4: Verify Setup

```bash
# Test connection to n8n
npm run workflows:status

# Should show your managed workflows
```

## ⚙️ Configuration

### Workflow Naming Convention

Your n8n workflows must follow this naming pattern:
```
[Base Name][Environment Suffix]

✅ Correct:
- "Customer Onboarding-dev"
- "Customer Onboarding-prod"
- "Email Marketing Campaign-dev"
- "Email Marketing Campaign-prod"

❌ Incorrect:
- "Customer Onboarding Dev" (space instead of hyphen)
- "customer-onboarding-dev" (inconsistent casing)
```

### Managed Workflows Configuration

Each workflow in `managed-workflows.json` supports these options:

```json
{
  "baseName": "Workflow Name",           // Base name (without suffix)
  "description": "What this workflow does",
  "environments": ["dev", "prod"],       // Which environments to manage
  "variables": {                         // Environment-specific variables
    "dev": { "var1": "dev value" },
    "prod": { "var1": "prod value" }
  }
}
```

### Environment Settings

Configure global settings in `managed-workflows.json`:

```json
{
  "settings": {
    "backupBeforeDeploy": true,            // Auto-backup before production deployment
    "maxBackupsToKeep": 10              // Automatic backup cleanup
  }
}
```

## 🎯 Daily Usage

### Development Workflow

```bash
# 1. Work on your workflows in n8n Cloud UI
#    (Make changes to workflows ending with "-dev")

# 2. Export your changes
npm run workflows:export:dev

# 3. Check what changed
git status
git diff

# 4. Commit your changes
git add workflows/exported/
git commit -m "feat: improve customer onboarding flow"
git push

# 5. Make local changes to workflow files
#    (Edit files in workflows/exported/)

# 6. Push local changes back to n8n dev environment
npm run workflows:import:dev "Customer Onboarding"

# 7. When ready for production
npm run workflows:deploy "Customer Onboarding"
```

### Using Interactive Mode (Recommended)

```bash
# Start interactive mode
npm run interactive

# Follow the menu:
# 1. Export development workflows     ← Export after making changes
# 2. Import local workflows to dev    ← Push local changes to n8n
# 3. Deploy workflows to production     ← Deploy to production
# 4. View workflow status             ← Check current state
# 5. List managed workflows           ← See all managed workflows
# 6. Backup operations                ← Manage backups
# 7. Exit
```

### Quick Commands

```bash
# Status check (always safe to run)
npm run workflows:status

# Export specific workflows
npm run workflows:export:dev "Customer Onboarding" "Email Marketing"

# Import local workflow files to n8n dev environment
npm run workflows:import:dev "Customer Onboarding" "Email Marketing"

# Deploy specific workflow to production
npm run workflows:deploy "Customer Onboarding"

# Create backup before making changes
npm run backup:create:prod

# List available backups
npm run backup:list
```

## 📖 Command Reference

### Workflow Operations

| Command | Description | Example |
|---------|-------------|---------|
| `npm run workflows:export:dev` | Export all dev workflows | |
| `npm run workflows:export:prod` | Export all prod workflows | |
| `npm run workflows:import:dev` | Import local files to dev | `npm run workflows:import:dev "Customer Onboarding"` |
| `npm run workflows:import:prod` | Import local files to prod | `npm run workflows:import:prod "Email Marketing"` |
| `npm run workflows:deploy "Name"` | Deploy dev workflow to prod | `npm run workflows:deploy "Customer Onboarding"` |
| `npm run workflows:list` | List all managed workflows | |
| `npm run workflows:list:dev` | List dev workflows only | |
| `npm run workflows:status` | Show detailed status report | |
| `npm run workflows:validate` | Validate exported workflows | |

### Backup Operations

| Command | Description | Example |
|---------|-------------|---------|
| `npm run backup:create` | Create prod backup | |
| `npm run backup:create:dev` | Create dev backup | |
| `npm run backup:list` | List all backups | |
| `npm run backup:restore` | Interactive restore | |
| `npm run backup:cleanup` | Clean old backups | |
| `npm run emergency:restore` | Emergency restore process | |

### Advanced Commands

| Command | Description | Example |
|---------|-------------|---------|
| `npm run interactive` | Interactive workflow manager | |
| `npm run full-backup` | Create backup + archive | |
| `node scripts/manage-workflows.js status` | Direct script access | |
| `node scripts/compare-backups.js backup1 backup2` | Compare backups | |
| `node scripts/verify-backup.js backup_name` | Verify backup integrity | |

## 🤖 GitHub Actions

### Available Workflows

#### 1. Export Development Workflows
**When to use**: After making changes in n8n Cloud UI

**Steps**:
1. Go to **Actions** → **"Export Development Workflows"**
2. Click **"Run workflow"**
3. **Workflows**: Enter specific workflow names or leave empty for all
4. **Run**

**Result**: Exports workflows to Git repository

#### 2. Deploy Workflows to Production
**When to use**: Deploy tested workflows to production

**Steps**:
1. Go to **Actions** → **"Deploy Workflows to Production"**
2. Click **"Run workflow"**
3. **Workflows**: Enter comma-separated names: `Customer Onboarding, Email Marketing`
4. **Skip backup**: Leave unchecked (recommended)
5. **Custom backup name**: Optional
6. **Run** → Wait for approval → Deployment completes

**Result**:
- Creates automatic backup
- Deploys dev workflows to prod versions
- Workflows imported as INACTIVE (safety)
- Slack notification sent

#### 3. Create Production Backup
**When to use**: Before major changes or on-demand

**Steps**:
1. Go to **Actions** → **"Create Production Backup"**
2. Click **"Run workflow"**
3. **Environment**: prod (default) or dev
4. **Custom backup name**: Optional
5. **Run**

**Result**: Creates timestamped backup

#### 4. Emergency Restore from Backup
**When to use**: Production issues requiring immediate rollback

**Steps**:
1. Go to **Actions** → **"Emergency Restore from Backup"**
2. Click **"Run workflow"**
3. **Backup name**: e.g., `backup_prod_20241201_143000`
4. **Workflows**: Specific workflows or leave empty for all
5. **Confirmation**: Type `CONFIRM`
6. **Run** → Requires 2 emergency approver approvals
7. **Result**: Restores workflows

**⚠️ Emergency Use Only**: Requires special approvers and creates pre-restore backup

### Setting Up Approvers

In your GitHub repository, go to **Settings** → **Environments**:

1. **Create "production" environment**
    - Add required reviewers for production deployments
    - Set protection rules

2. **Create "emergency" environment**
    - Add emergency approvers (should be senior team members)
    - Require 2 approvals for emergency restores

3. **Set repository variables**:
    - `PRODUCTION_APPROVERS`: `username1,username2`
    - `EMERGENCY_APPROVERS`: `senior1,senior2,manager1`

## 💾 Backup & Restore

### Understanding Backups

Backups are stored in `workflows/backups/` with this structure:
```
workflows/backups/
├── backup_prod_20241201_143000/        # Timestamped backup folder
│   ├── customer_onboarding-prod.json   # Individual workflow files
│   ├── email_marketing-prod.json
│   └── _backup_metadata.json           # Backup information
├── backup_prod_20241202_090000/
└── daily_auto_20241203_020000/
```

### Backup Types

| Type | When Created | Naming Pattern | Purpose |
|------|--------------|----------------|---------|
| **Manual** | `npm run backup:create` | `backup_prod_YYYYMMDD_HHMMSS` | Before major changes |
| **Pre-deploy** | Before production deployment | `pre_deploy_auto_YYYYMMDD_HHMMSS` | Automatic safety backup |
| **Daily** | GitHub Actions schedule | `daily_auto_YYYYMMDD_HHMMSS` | Regular automated backup |
| **Emergency** | Before emergency restore | `emergency_pre_restore_YYYYMMDD_HHMMSS` | Emergency safety backup |

### Backup Operations

#### Create Backup
```bash
# Interactive backup creation
npm run interactive
# → Select 5 (Backup operations)
# → Select 1 (Create new backup)

# Command line
npm run backup:create:prod
npm run backup:create:dev

# Custom name
node scripts/manage-workflows.js backup prod "before-major-update"
```

#### List Backups
```bash
npm run backup:list

# Output example:
📦 Available Backups:
====================
  📦 backup_prod_20241201_143000
     Created: 12/1/2024, 2:30:00 PM
     Workflows: 5

  📦 pre_deploy_auto_20241201_120000
     Created: 12/1/2024, 12:00:00 PM
     Workflows: 5
```

#### Restore from Backup
```bash
# Interactive restore (recommended)
npm run backup:restore

# Command line - restore all workflows
node scripts/manage-workflows.js restore "backup_prod_20241201_143000"

# Restore specific workflows
node scripts/manage-workflows.js restore "backup_prod_20241201_143000" "Customer Onboarding" "Email Marketing"
```

#### Verify Backup Integrity
```bash
# Verify specific backup
node scripts/verify-backup.js backup_prod_20241201_143000

# Verify all backups
node scripts/verify-backup.js

# Output example:
🔍 Verifying backup: backup_prod_20241201_143000
📊 Metadata: 5 workflows, created 2024-12-01T14:30:00.000Z
📁 Found 5 workflow files
📏 Backup size: 125.67 KB
✅ Backup verification passed - no issues found!
```

#### Compare Backups
```bash
node scripts/compare-backups.js backup_prod_20241201_120000 backup_prod_20241201_143000

# Output example:
🔍 Comparing backups:
   📦 backup_prod_20241201_120000
   📦 backup_prod_20241201_143000

📊 File comparison:
   backup_prod_20241201_120000: 5 files
   backup_prod_20241201_143000: 5 files
   Common files: 5

🔍 Comparing 5 common workflows...

📊 Comparison Results:
==================================================
Found 2 difference(s):

🔢 Node count changed
   File: customer_onboarding-prod.json
   Details: {"from":8,"to":10}

🔧 Node types changed
   File: email_marketing-prod.json
   Details: {"added":["n8n-nodes-base.slack"],"removed":[]}
```

### Emergency Procedures

#### When Things Go Wrong

1. **Immediate Response**
   ```bash
   # Create incident backup first
   npm run backup:create:prod "incident-$(date +%Y%m%d-%H%M)"

   # List recent backups
   npm run backup:list
   ```

2. **Quick Local Restore**
   ```bash
   # Restore specific broken workflow
   node scripts/manage-workflows.js restore "pre_deploy_auto_20241201_120000" "Broken Workflow"
   ```

3. **GitHub Actions Emergency Restore**
    - Use when local restore isn't possible
    - Requires 2 emergency approver approvals
    - Creates automatic pre-restore backup
    - All restored workflows are INACTIVE until manually activated

#### Recovery Checklist

- [ ] Create incident backup
- [ ] Identify last known good backup
- [ ] Determine which workflows need restoration
- [ ] Perform restore (local or GitHub Actions)
- [ ] Verify restored workflows in n8n Cloud
- [ ] Manually activate workflows after testing
- [ ] Document incident and resolution

## 🎯 Best Practices

### Development Workflow

1. **Always work on `-dev` versions first**
    - Test thoroughly in development
    - Never edit production workflows directly

2. **Export changes regularly**
   ```bash
   npm run workflows:export:dev
   git add workflows/exported/
   git commit -m "feat: improve error handling"
   ```

3. **Use descriptive commit messages**
   ```bash
   git commit -m "feat: add Slack notifications to onboarding"
   git commit -m "fix: handle email bounce errors properly"
   git commit -m "docs: update workflow documentation"
   ```

### Production Deployment

1. **Always create backups before major changes**
   ```bash
   npm run backup:create:prod "before-v2-release"
   ```

2. **Use selective deployment for safer deployments**
   ```bash
   # Deploy one workflow at a time for critical changes
   npm run workflows:deploy "Customer Onboarding"
   ```

3. **Verify after deployment**
    - Check workflows in n8n Cloud UI
    - Manually activate workflows after verification
    - Monitor first few executions

### Backup Management

1. **Regular backup schedule**
    - Daily automated backups via GitHub Actions
    - Manual backups before major changes
    - Keep 30 days of daily backups

2. **Backup verification**
   ```bash
   # Verify backups weekly
   node scripts/verify-backup.js
   ```

3. **Cleanup old backups**
   ```bash
   # Keep reasonable number of backups
   npm run backup:cleanup
   ```

### Team Collaboration

1. **Use managed-workflows.json**
    - Document all managed workflows
    - Include ownership and descriptions
    - Keep it updated when adding new workflows

2. **GitHub Actions for team deployments**
    - Use approval workflows for production
    - Require code reviews for repository changes
    - Set up proper notification channels

3. **Document changes**
    - Update workflow descriptions
    - Document any breaking changes
    - Maintain changelog for major updates

## 🔧 Troubleshooting

### Common Issues

#### "API Key Invalid" Error
```bash
# Symptoms
❌ Failed to fetch workflows: Request failed with status code 401

# Solutions
1. Check API key in config/n8n-config.json
2. Verify API key hasn't expired in n8n Cloud
3. Ensure API key has correct permissions
4. Test connection: npm run workflows:status
```

#### "Workflow not found" Error
```bash
# Symptoms  
❌ Dev workflow not found: Customer Onboarding-dev

# Solutions
1. Check workflow exists in n8n Cloud with exact name
2. Verify suffix matches managed-workflows.json settings
3. Check workflow is listed in managed-workflows.json
4. List current workflows: npm run workflows:list
```

#### "Backup not found" Error
```bash
# Symptoms
❌ Backup not found: backup_prod_20241201_143000

# Solutions
1. List available backups: npm run backup:list
2. Check backup directory: ls -la workflows/backups/
3. Verify backup name format (backup_env_YYYYMMDD_HHMMSS)
4. Check if backup was created: node scripts/verify-backup.js
```

#### "Sync failed" Error
```bash
# Symptoms
❌ Failed to sync Customer Onboarding: Node missing name or type

# Solutions
1. Validate workflows: npm run workflows:validate
2. Check dev workflow in n8n Cloud
3. Export fresh copy: npm run workflows:export:dev
4. Check for credential references
```

#### GitHub Actions Failing
```bash
# Symptoms
GitHub Action workflow fails with authentication error

# Solutions
1. Check GitHub Secrets are set correctly:
   - N8N_CLOUD_URL
   - N8N_API_KEY  
   - N8N_WEBHOOK_URL
2. Verify n8n Cloud instance is accessible
3. Check API key permissions and expiration
4. Review GitHub Actions logs for specific errors
```

#### Import/Export Issues
```bash
# Symptoms
Workflows export but don't import correctly

# Solutions
1. Check for credential name mismatches
2. Verify workflow JSON structure: npm run workflows:validate
3. Check for environment-specific configurations
4. Review n8n Cloud API limitations
```

### Debug Commands

```bash
# Test n8n API connection
node -e "
const axios = require('axios');
const config = require('./config/n8n-config.json');
axios.get(config.n8n.baseUrl + '/api/v1/workflows', {
  headers: {'X-N8N-API-KEY': config.n8n.apiKey}
}).then(r => console.log('✅ Connection OK:', r.data.data.length, 'workflows'))
.catch(e => console.error('❌ Connection failed:', e.response?.status, e.response?.statusText));
"

# Check workflow structure
node -e "
const fs = require('fs');
const workflow = JSON.parse(fs.readFileSync('workflows/exported/customer_onboarding-dev.json'));
console.log('Workflow:', workflow.name);
console.log('Nodes:', workflow.nodes?.length || 0);
console.log('Active:', workflow.active);
"

# Validate managed workflows config
node -e "
const config = require('./config/managed-workflows.json');
console.log('Managed workflows:', config.managedWorkflows.length);
config.managedWorkflows.forEach(w => console.log('-', w.baseName, '(' + w.environments.join(', ') + ')'));
"
```

### Getting Help

1. **Check this README first** - Most common issues are covered here
2. **Review GitHub Issues** - Search for similar problems
3. **Check n8n Community** - For n8n-specific questions
4. **Enable debug logging**:
   ```bash
   DEBUG=true npm run workflows:status
   ```

## 🚀 Advanced Features

### Environment Variables Injection

This feature allows you to define environment-specific variables in `managed-workflows.json` and automatically inject them into your workflows during import or deployment.

#### How It Works

1. Define variables in `managed-workflows.json`:
```json
{
  "baseName": "Email Marketing",
  "description": "Email campaign automation",
  "environments": ["dev", "prod"],
  "variables": {
    "dev": { 
      "var1": "dev value",
      "apiUrl": "https://dev-api.example.com" 
    },
    "prod": { 
      "var1": "prod value",
      "apiUrl": "https://api.example.com" 
    }
  }
}
```

2. Create a "Configuration" or "Variables" node in your workflow:
   - Use a Code node named either "Configuration" or "Variables"
   - The system will automatically find this node and inject the appropriate variables
   - If no such node exists, the system will create a Code node named "Configuration" for you
   - If a node with the right name exists but is not a Code node, it will be converted to a Code node

3. During import or deployment:
   - When importing to dev: dev variables are injected
   - When deploying to prod: prod variables are injected

#### Example

In your n8n workflow, create a Code node named "Configuration":
```javascript
// This will be automatically replaced during import/deploy
return {
  var1: 'placeholder',
  apiUrl: 'placeholder'
};
```

After import/deploy to dev, it becomes:
```javascript
return {
  "var1": "dev value",
  "apiUrl": "https://dev-api.example.com"
};
```

After deploy to prod, it becomes:
```javascript
return {
  "var1": "prod value",
  "apiUrl": "https://api.example.com"
};
```

#### Benefits

- Keep environment-specific configuration in version control
- No need to manually update variables when deploying
- Consistent variable management across environments
- Secure handling of environment-specific values

### Custom Validation Rules

Create `scripts/custom-validation.js`:
```javascript
// Add your custom validation logic
const customValidation = (workflow) => {
  const errors = [];

  // Example: Check for required tags in production
  if (workflow.name.endsWith('-prod')) {
    if (!workflow.tags || workflow.tags.length === 0) {
      errors.push('Production workflows must have tags');
    }
  }

  // Example: Check for test nodes in production
  if (workflow.name.endsWith('-prod')) {
    const testNodes = workflow.nodes.filter(n => 
      n.name.toLowerCase().includes('test')
    );
    if (testNodes.length > 0) {
      errors.push('Production workflows should not contain test nodes');
    }
  }

  return errors;
};
```

### Scheduled Backups

Add to `.github/workflows/scheduled-backup.yml`:
```yaml
name: Daily Backup

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      # ... backup steps
```

### Custom Webhook Triggers

Create workflows in n8n that trigger CI/CD operations:
```json
{
  "name": "CI/CD Webhook Trigger",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "cicd-trigger"
      }
    },
    {
      "name": "GitHub API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://api.github.com/repos/yourorg/n8n-workflows/dispatches",
        "method": "POST",
        "body": {
          "event_type": "deploy_production",
          "client_payload": "={{$json}}"
        }
      }
    }
  ]
}
```

### Workflow Templates

Create reusable workflow templates in `templates/`:
```
templates/
├── basic-webhook.json
├── email-automation.json
└── data-sync.json
```

Use templates:
```bash
# Copy template to managed workflow
cp templates/basic-webhook.json workflows/exported/new-workflow-dev.json
# Edit the workflow name and import
```

### Integration with External Tools

#### Slack Notifications
Set up Slack webhooks for different events:
- Successful production deployments
- Failed deployments
- Emergency restores
- Daily backup reports

#### Email Alerts
Configure email notifications for critical events:
- Production deployment failures
- Backup failures
- Emergency restore completions

#### Monitoring Integration
Connect with monitoring tools:
- Send deployment events to DataDog/New Relic
- Update status pages during deployments
- Log all operations for audit purposes

**Happy Automating! 🚀**
