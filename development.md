# n8n Cloud CI/CD with Backup & Restore - Development Guide

This document provides detailed technical information and development instructions for the n8n CI/CD system. For user-focused instructions, please refer to the [README.md](README.md).

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Components](#core-components)
- [Development Setup](#development-setup)
- [Scripts Reference](#scripts-reference)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Configuration Files](#configuration-files)
- [Workflow Management](#workflow-management)
- [Backup & Restore System](#backup--restore-system)
- [Release Management](#release-management)
- [Deployment Process](#deployment-process)
- [Environment Variables](#environment-variables)
- [Contributing Guidelines](#contributing-guidelines)

## System Architecture

The n8n CI/CD system is designed to manage workflows across development and production environments within a single n8n Cloud instance. It uses a naming convention with environment suffixes (`-dev`, `-prod`) to distinguish between environments.

### Key Design Principles

1. **Single Instance Management**: Uses a single n8n Cloud instance with environment suffixes
2. **Version Control**: All workflows are stored in Git for version tracking
3. **Controlled Deployment**: Structured process for promoting workflows from dev to prod
4. **Comprehensive Backup**: Automatic and manual backup capabilities
5. **Safety First**: Pre-deployment backups and validation checks

### Data Flow

```
n8n Cloud → Export Scripts → Git Repository → GitHub Actions → Deployment Scripts → n8n Cloud
```

## Core Components

### 1. Workflow Manager

The `WorkflowManager` class in `scripts/manage-workflows.js` is the core component that handles all aspects of workflow management:
- Fetching workflows from n8n
- Exporting workflows to the repository
- Importing workflows to n8n
- Deploying workflows from dev to prod
- Creating and restoring backups
- Managing environment-specific variables and credentials
- Cleaning up old backups
- Generating detailed summaries for exports, imports, deployments, and restores

## Development Setup

### Prerequisites

- Node.js 18 or higher
- Git
- n8n Cloud instance with API access
- GitHub repository with Actions enabled

### Initial Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd n8n-ci-cd
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create configuration files:
   ```bash
   cp config/n8n-config.json.example config/n8n-config.json
   cp config/managed-workflows.json.example config/managed-workflows.json
   ```

4. Configure your n8n instance:
   - Edit `config/n8n-config.json` with your n8n Cloud URL
   - Create a `.env` file with your n8n API key:
     ```
     N8N_API_KEY=your_api_key_here
     ```

5. Define your managed workflows in `config/managed-workflows.json`

### Development Workflow

1. Make changes to scripts or configuration files
2. Test changes locally using the CLI commands
3. Commit changes to a feature branch
4. Create a pull request to the main branch
5. After review and testing, merge the pull request

## Scripts Reference

### manage-workflows.js

The main script for managing workflows, backups, and deployments.

```bash
# Export all dev workflows
node scripts/manage-workflows.js export dev

# Export specific workflows
node scripts/manage-workflows.js export dev "Workflow Name 1" "Workflow Name 2"

# Import workflows to dev
node scripts/manage-workflows.js import dev "Workflow Name"

# Deploy workflow from dev to prod
node scripts/manage-workflows.js deploy "Workflow Name"

# Create backup
node scripts/manage-workflows.js backup prod "custom-backup-name"

# Restore from backup
node scripts/manage-workflows.js restore "backup_name" "Workflow Name"

# List all managed workflows
node scripts/manage-workflows.js list

# Show workflow status
node scripts/manage-workflows.js status

# List available backups
node scripts/manage-workflows.js list-backups

# Clean up old backups
node scripts/manage-workflows.js cleanup-backups 10
```

## GitHub Actions Workflows

### export-dev.yml

- **Purpose**: Export development workflows to the repository
- **Trigger**: Manual workflow dispatch
- **Inputs**: Specific workflows to export (optional)
- **Key Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Inject API key
  5. Export workflows
  6. Commit changes
  7. Create export summary
  8. Upload artifacts
  9. Create notification

### create-release-candidate.yml

- **Purpose**: Create a release candidate for a workflow
- **Trigger**: Manual workflow dispatch
- **Inputs**: Workflow name and version
- **Key Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Configure Git
  4. Validate and export workflow
  5. Ensure prod branch exists
  6. Analyze workflow changes
  7. Create release tag
  8. Create release candidate branch
  9. Create pull request to prod
  10. Create GitHub release
  11. Upload artifacts

### deploy-production.yml

- **Purpose**: Deploy workflows to production
- **Trigger**: Push to prod branch
- **Key Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Detect workflows to deploy
  4. Run full deployment
  5. Update releases
  6. Commit deployment artifacts
  7. Upload artifacts

### scheduled-backup.yml

- **Purpose**: Create automated backups
- **Trigger**: Daily schedule or manual
- **Key Steps**:
  1. Checkout code
  2. Setup Node.js
  3. Create backup
  4. Commit backup

## Configuration Files

### n8n-config.json

Contains configuration for connecting to n8n Cloud.

```json
{
  "n8n": {
    "baseUrl": "https://yourcompany.app.n8n.cloud",
    "webhookUrl": "https://yourcompany.app.n8n.cloud/webhook"
  },
  "settings": {
    "backupBeforeDeploy": true,
    "maxBackupsToKeep": 10
  }
}
```

### managed-workflows.json

Defines which workflows are managed by the system.

```json
{
  "managedWorkflows": [
    {
      "baseName": "Workflow Name",
      "description": "Description of the workflow",
      "variables": {
        "dev": {
          "apiUrl": "https://dev-api.example.com",
          "retryAttempts": 3
        },
        "prod": {
          "apiUrl": "https://api.example.com",
          "retryAttempts": 5
        }
      },
      "credentials": {
        "dev": {
          "telegramApi": {
            "id": "dev-credential-id",
            "name": "Dev Telegram account"
          }
        },
        "prod": {
          "telegramApi": {
            "id": "prod-credential-id",
            "name": "Prod Telegram account"
          }
        }
      }
    }
  ]
}
```

## Workflow Management

### Workflow Naming Convention

Workflows must follow this naming pattern:
```
[Base Name][Environment Suffix]
```

Examples:
- "Customer Onboarding-dev"
- "Customer Onboarding-prod"

### Workflow Files

Exported workflows are stored in the `workflows` directory with filenames derived from the workflow name:
```
workflows/
├── customer_onboarding.json
├── email_marketing.json
└── ...
```

### Workflow Lifecycle

1. **Development**: Create and modify workflows in n8n Cloud with `-dev` suffix
2. **Export**: Export workflows to the repository
3. **Version Control**: Commit changes to Git
4. **Release**: Create a release candidate
5. **Approval**: Review and approve the release
6. **Deployment**: Deploy to production
7. **Verification**: Verify the deployment

## Backup & Restore System

### Backup Types

1. **Manual Backups**: Created on-demand
2. **Pre-deployment Backups**: Created automatically before deployment
3. **Scheduled Backups**: Created on a schedule via GitHub Actions

### Backup Storage

Backups are stored in the `backups` directory:
```
backups/
├── daily_auto_20250903_022950/
│   ├── customer_onboarding.json
│   ├── email_marketing.json
│   └── _backup_metadata.json
├── pre_deploy_auto_20250902_090000/
└── backup_prod_20250901_143000/
```

### Backup Metadata

Each backup includes a metadata file with information about the backup:
```json
{
  "backupName": "backup_prod_20241201_143000",
  "environment": "prod",
  "createdAt": "2024-12-01T14:30:00.000Z",
  "workflowCount": 5,
  "failedCount": 0,
  "workflows": [...]
}
```

### Restore Process

The restore process:
1. Reads workflow files from the backup directory
2. For each workflow, checks if it exists in n8n
3. If it exists, updates it; if not, creates it
4. Generates a restore summary

## Release Management

### Release Process

1. **Validate**: Ensure the workflow exists in dev
2. **Export**: Export the latest version
3. **Analyze**: Compare with previous versions
4. **Tag**: Create a Git tag for the release
5. **Branch**: Create a release candidate branch
6. **PR**: Create a pull request to the prod branch
7. **Release**: Create a GitHub release with changelog

### Version Tracking

Versions follow semantic versioning (e.g., "1.0.0").

Git tags are created for each release:
```
workflow-name-1.0.0
workflow-name-1.0.1
```

### Change Analysis

The system analyzes changes between versions:
- Node count changes
- Node type additions/removals
- Active status changes
- Tag changes

## Deployment Process

### Deployment Steps

1. **Detect**: Determine which workflows to deploy
2. **Backup**: Create a pre-deployment backup
3. **Validate**: Ensure workflows exist in dev
4. **Deploy**: Deploy workflows to production
5. **Verify**: Verify successful deployment
6. **Notify**: Create deployment notification

### Safety Measures

- Pre-deployment backups
- Workflow validation
- Post-deployment verification
- Deployment summaries
- Rollback capabilities

## Environment Variables

### Environment-specific Variables

Define environment-specific variables in `managed-workflows.json`:
```json
"variables": {
  "dev": {
    "apiUrl": "https://dev-api.example.com"
  },
  "prod": {
    "apiUrl": "https://api.example.com"
  }
}
```

### Variable Injection

Variables are injected into workflows during import/deployment:
1. The system looks for a "Configuration" or "Variables" node
2. If found, it updates the node with environment-specific variables
3. If not found, it creates a new "Configuration" node

## Contributing Guidelines

### Code Style

- Use consistent indentation (2 spaces)
- Follow JavaScript best practices
- Add comments for complex logic
- Use meaningful variable and function names

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Create a pull request with a clear description
5. Address review comments
6. Merge after approval

### Testing

- Test all changes locally before committing
- Verify exports, imports, and deployments
- Test backup and restore functionality
- Ensure GitHub Actions workflows run successfully

### Documentation

- Update this development guide for significant changes
- Document new features and configuration options
- Keep the README.md user-friendly and up-to-date
