# n8n Cloud CI/CD with Backup & Restore

A comprehensive CI/CD solution for managing n8n workflows in a single Cloud instance using environment suffixes (`-dev`, `-prod`) with version control, automated deployments, and robust backup/restore capabilities.

> **Note:** For detailed development instructions and technical details, please refer to [development.md](development.md).

## 🌟 Features

- **🎯 Selective Workflow Management**: Choose exactly which workflows to export, sync, or restore
- **🔄 Environment Suffixes**: Clean separation using `-dev` and `-prod` workflow naming
- **💾 Comprehensive Backup System**: Automatic backups, manual backups, and emergency restore
- **🤖 GitHub Actions Integration**: Automated deployments with approval workflows
- **🛡️ Safety First**: Automatic pre-sync backups
- **💰 Cost Effective**: Single n8n Cloud instance instead of multiple environments

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Project Setup](#project-setup)
- [GitHub Actions](#github-actions)
- [Daily Workflow](#daily-workflow)
- [Production Deployment](#production-deployment)
- [Backup & Restore](#backup--restore)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### 1. Set Up Your Repository

1. **Fork or clone** this repository to your GitHub account
2. **Install** on your local machine if you want to make local changes

### 2. Configure Your n8n Instance

1. **Create a `.env` file** with your n8n API key:
   ```
   N8N_API_KEY=your-n8n-api-key
   ```

2. **Copy and edit configuration files**:
   - Copy `config/n8n-config.json.example` to `config/n8n-config.json`
   - Update with your n8n Cloud URL:
     ```json
     {
       "n8n": {
         "baseUrl": "https://yourcompany.app.n8n.cloud"
       }
     }
     ```

### 3. Define Your Workflows

1. **Copy and edit** `config/managed-workflows.json.example` to `config/managed-workflows.json`
2. **List your workflows**:
   ```json
   {
     "managedWorkflows": [
       {
         "baseName": "Customer Onboarding",
         "description": "New customer welcome automation"
       }
     ]
   }
   ```

### 4. Set Up GitHub Actions

1. **Add your n8n API key** as a GitHub repository secret
2. **Run the "Commit development workflows" action** to export your workflows
3. **Create a release candidate** when you're ready to deploy to production

## 🔧 Project Setup

### Prerequisites

- **n8n Cloud**: Paid subscription with API access
- **GitHub**: Repository with Actions enabled
- **Node.js**: Version 18 or higher
- **Workflow Naming**: Use `-dev` and `-prod` suffixes (e.g., "Customer Onboarding-dev")

### GitHub Repository Configuration

1. **Set up GitHub Secrets**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add a new repository secret:
     - Name: `N8N_API_KEY`
     - Value: Your n8n API key

2. **Set up GitHub Environments**:
   - Go to Settings → Environments → New environment
   - Create "production" environment
   - Add required reviewers for production deployments
   - Create "emergency" environment for restore operations

### n8n API Key

1. Log into your n8n Cloud instance
2. Go to **Settings** → **n8n API**
3. Click **"Create an API key"**
4. Set label: "CI/CD System"
5. Set expiration: 1 year
6. Copy the key immediately (you won't see it again!)

### Configuration Files

1. **n8n-config.json**:
   ```json
   {
     "n8n": {
       "baseUrl": "https://yourcompany.app.n8n.cloud"
     },
     "settings": {
       "backupBeforeDeploy": true,
       "maxBackupsToKeep": 10
     }
   }
   ```

2. **managed-workflows.json**:
   ```json
   {
     "managedWorkflows": [
       {
         "baseName": "Customer Onboarding",
         "description": "Automated welcome sequence"
       }
     ]
   }
   ```

## 🔄 Daily Workflow

### Using GitHub Actions for Daily Development

The recommended workflow for daily development is to use GitHub Actions:

1. **Make changes to workflows in n8n Cloud UI**
   - Work only on workflows ending with `-dev` suffix
   - Test your changes thoroughly in the n8n interface

2. **Export your changes using GitHub Actions**
   - Go to your GitHub repository
   - Click on "Actions" tab
   - Select "Commit development workflows"
   - Click "Run workflow"
   - Enter specific workflow names (comma-separated) or leave empty for all
   - Click "Run workflow" button

3. **Review the exported workflows**
   - GitHub Action will export workflows and commit them to your repository
   - Review the changes in the commit

4. **Create a release candidate when ready**
   - Go to "Actions" tab
   - Select "Create Release Candidate"
   - Enter workflow name and version
   - Click "Run workflow"
   - This creates a pull request to the prod branch

### Checking Workflow Status

To check the status of your workflows:

1. Go to your n8n Cloud instance
2. Navigate to the Workflows section
3. Look for workflows with `-dev` and `-prod` suffixes
4. Check their active/inactive status

> **Note:** For advanced users who prefer working with terminal commands, please refer to the [development.md](development.md) file.

## 🤖 GitHub Actions

This project includes several GitHub Actions workflows to automate the CI/CD process.

### 1. Commit Development Workflows

**Purpose**: Export workflows from n8n to the repository after making changes in the n8n UI.

**How to use**:
1. Go to **Actions** → **"Commit development workflows"**
2. Click **"Run workflow"**
3. **Workflows**: Enter specific workflow names (comma-separated) or leave empty for all
4. Click **"Run workflow"** button

**What it does**:
- Connects to your n8n instance
- Exports the specified workflows (or all managed workflows)
- Commits the exported files to your repository

### 2. Create Release Candidate

**Purpose**: Create a release candidate for deploying a workflow to production.

**How to use**:
1. Go to **Actions** → **"Create Release Candidate"**
2. Click **"Run workflow"**
3. Enter:
   - **Workflow name**: The base name of the workflow (without -dev suffix)
   - **Version**: Version number (e.g., "1.0.0")
4. Click **"Run workflow"** button

**What it does**:
- Validates the workflow exists in development
- Creates a release tag and branch
- Creates a pull request to the prod branch
- Creates a GitHub release with changelog

### 3. Deploy to Production

**Purpose**: Deploy workflows to production when a pull request is merged to the prod branch.

**How to use**:
- This workflow runs automatically when changes are merged to the prod branch
- Alternatively, you can deploy directly from a release candidate PR by approving and merging it

**What it does**:
- Creates a backup of production workflows
- Deploys the workflows from dev to prod
- Verifies the deployment was successful
- Creates deployment artifacts and summaries

### 4. Scheduled Production Backup

**Purpose**: Create automated backups of production workflows.

**How to use**:
- Runs automatically daily at 2 AM UTC
- Can also be triggered manually:
  1. Go to **Actions** → **"Scheduled Production Backup"**
  2. Click **"Run workflow"**
  3. Click **"Run workflow"** button

**What it does**:
- Creates a timestamped backup of all production workflows
- Commits the backup to your repository

## 💾 Backup & Restore

The system includes comprehensive backup and restore capabilities to ensure you can recover from any issues.

### Creating Backups

#### Using GitHub Actions (Recommended)

1. Go to **Actions** → **"Scheduled Production Backup"**
2. Click **"Run workflow"**
3. Click **"Run workflow"** button

This creates a backup and commits it to your repository.

### Viewing Backups

To view your backups:

1. Go to your GitHub repository
2. Navigate to the `backups/` directory
3. Each backup is in its own timestamped folder

> **Note:** For advanced users who prefer working with terminal commands, please refer to the [development.md](development.md) file.

### Backup Types

| Type | Created By | Purpose |
|------|------------|---------|
| **Daily** | Scheduled GitHub Action | Regular automated backup |
| **Pre-deploy** | Deploy workflow | Safety backup before deployment |
| **Manual** | User-initiated | Before major changes |

### Backup Storage

Backups are stored in the `backups/` directory in your repository, with each backup in its own timestamped folder containing the workflow files and metadata.

## 🚀 Production Deployment

### Deploying to Production

There are two ways to deploy workflows to production:

#### Method 1: Using Release Candidate (Recommended)

1. **Create a Release Candidate**:
   - Go to **Actions** → **"Create Release Candidate"**
   - Enter workflow name and version
   - Click "Run workflow"

2. **Review the Pull Request**:
   - The action creates a pull request to the prod branch
   - Review the changes in the PR
   - Complete the pre-deployment checklist

3. **Approve and Merge**:
   - Approve the pull request
   - Merge it to the prod branch
   - This automatically triggers the deployment workflow

4. **Verify Deployment**:
   - Check the "Deploy to Production" workflow run
   - Verify workflows in n8n Cloud UI
   - Manually activate workflows if needed

> **Note:** For advanced users who prefer working with terminal commands, please refer to the [development.md](development.md) file.

### Post-Deployment Steps

After deploying to production:

1. **Verify in n8n Cloud UI**:
   - Check that the workflow appears correctly
   - Ensure connections are properly configured

2. **Activate the Workflow**:
   - Manually activate the workflow if it is not already active

3. **Monitor Executions**:
   - Watch the first few executions
   - Check for any errors or issues

## 🔧 Troubleshooting

### Common Issues and Solutions

#### GitHub Actions Authentication Failure

**Symptoms**: GitHub Action fails with "Failed to fetch workflows" or authentication errors

**Solutions**:
1. Check that the `N8N_API_KEY` secret is correctly set in your repository
2. Verify the API key hasn't expired in n8n Cloud
3. Ensure the n8n Cloud instance is accessible
4. Check that the URL in `n8n-config.json` is correct

#### Workflow Not Found Error

**Symptoms**: Error message "Dev workflow not found: Workflow Name-dev"

**Solutions**:
1. Check that the workflow exists in n8n Cloud with the exact name
2. Verify the workflow is listed in `managed-workflows.json`
3. Ensure the workflow follows the naming convention (e.g., "Workflow Name-dev")
4. Check your workflows in the n8n Cloud interface

#### Export/Import Issues

**Symptoms**: Workflows export but don't import correctly

**Solutions**:
1. Check for credential name mismatches between environments
2. Verify workflow JSON structure is valid
3. Check for environment-specific configurations
4. Review n8n Cloud API limitations

### Testing Connection

To verify your connection to n8n:

1. Run the "Commit development workflows" GitHub Action
2. If it succeeds, your connection is working properly
3. If it fails, check the error messages in the Action logs

### Getting Help

If you encounter issues not covered here:

1. Check the [development.md](development.md) file for more detailed information
2. Check the GitHub Action logs for detailed error information

---

## Additional Resources

For more detailed information about the system's architecture, components, and advanced features, please refer to the [development.md](development.md) file.

**Happy Automating! 🚀**
