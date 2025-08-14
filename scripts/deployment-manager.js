#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DeploymentManager {
    constructor() {
        this.workingDir = process.cwd();
    }

    detectWorkflowsToDeploy(beforeCommit, afterCommit) {
        console.log('🔍 Detecting workflows to deploy based on git changes');

        let changedFiles;

        try {
            if (beforeCommit && afterCommit) {
                // Get changed files from the push
                changedFiles = execSync(`git diff --name-only ${beforeCommit}..${afterCommit}`, { encoding: 'utf8' });
            } else {
                // Fallback: compare with previous commit
                changedFiles = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' });
            }
        } catch (error) {
            console.warn('⚠️ Could not get git diff, falling back to all workflows');
            // If git diff fails, get all workflow files
            changedFiles = execSync('find workflows -name "*.json" | grep -v "_" || echo ""', { encoding: 'utf8' });
        }

        console.log('Changed files:', changedFiles);

        const workflowsToDeploySet = new Set();
        const files = changedFiles.trim().split('\n').filter(f => f.trim());

        for (const file of files) {
            if (file.match(/^workflows\/(.+)\.json$/)) {
                try {
                    const baseName = this.extractWorkflowBaseName(file);
                    if (baseName) {
                        workflowsToDeploySet.add(baseName);
                        console.log(`📋 Detected workflow: ${baseName} (from ${file})`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Could not process file ${file}: ${error.message}`);
                }
            }
        }

        const workflowsToDeployArray = Array.from(workflowsToDeploySet);
        console.log(`📊 Total workflows to deploy: ${workflowsToDeployArray.length}`);

        if (workflowsToDeployArray.length === 0) {
            throw new Error('No workflows detected for deployment');
        }

        return workflowsToDeployArray;
    }

    extractWorkflowBaseName(filePath) {
        console.log(`🔍 Extracting base name from: ${filePath}`);

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            if (fs.existsSync(filePath)) {
                // Read the actual workflow to get its name
                const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const baseName = manager.getBaseNameFromWorkflowName(workflow.name);
                console.log(`✅ Extracted base name: ${baseName}`);
                return baseName;
            } else {
                // Fallback: derive from filename
                const filename = path.basename(filePath, '.json');
                const baseName = filename.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                console.log(`⚠️ Fallback base name: ${baseName}`);
                return baseName;
            }
        } catch (error) {
            console.error(`❌ Failed to extract base name from ${filePath}: ${error.message}`);
            return null;
        }
    }

    async createBackup(environment = 'prod', customName = null) {
        console.log(`💾 Creating backup for ${environment} environment`);

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            const backupName = customName || `pre_deploy_auto_${new Date().toISOString().replace(/[:.]/g, '_').split('.')[0]}`;
            const result = await manager.createBackup(environment, backupName);

            if (result) {
                console.log(`✅ Backup created: ${result.backupName}`);
                return result.backupName;
            } else {
                throw new Error('Backup creation returned null');
            }
        } catch (error) {
            console.error(`❌ Backup creation failed: ${error.message}`);
            throw error;
        }
    }

    async validateWorkflowsExist(workflowNames) {
        console.log('🔍 Validating workflows exist before deployment');

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            const allWorkflows = await manager.getAllWorkflows();
            const validationResults = [];

            for (const workflowName of workflowNames) {
                const devWorkflowName = `${workflowName}-dev`;
                const devWorkflow = allWorkflows.find(w => w.name === devWorkflowName);

                if (!devWorkflow) {
                    validationResults.push({
                        workflow: workflowName,
                        valid: false,
                        error: `Dev workflow not found: ${devWorkflowName}`
                    });
                } else {
                    validationResults.push({
                        workflow: workflowName,
                        valid: true,
                        devWorkflow: devWorkflow
                    });
                    console.log(`✅ Found dev workflow: ${devWorkflowName}`);
                }
            }

            const failedValidations = validationResults.filter(r => !r.valid);
            if (failedValidations.length > 0) {
                const errors = failedValidations.map(f => f.error).join(', ');
                throw new Error(`Validation failed: ${errors}`);
            }

            console.log(`✅ All ${workflowNames.length} workflows validated successfully`);
            return validationResults;
        } catch (error) {
            console.error(`❌ Workflow validation failed: ${error.message}`);
            throw error;
        }
    }

    async deployWorkflows(workflowNames) {
        console.log(`🚀 Deploying ${workflowNames.length} workflows to production`);

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        const deploymentResults = [];

        try {
            for (const workflowName of workflowNames) {
                console.log(`🔄 Importing workflow: ${workflowName}`);

                try {
                    const result = await manager.importLocalWorkflows('prod', [workflowName]);
                    deploymentResults.push({
                        workflow: workflowName,
                        status: 'success',
                        result: result
                    });
                    console.log(`✅ Successfully imported: ${workflowName}`);
                } catch (error) {
                    deploymentResults.push({
                        workflow: workflowName,
                        status: 'failed',
                        error: error.message
                    });
                    console.error(`❌ Failed to import ${workflowName}: ${error.message}`);
                }
            }

            const successCount = deploymentResults.filter(r => r.status === 'success').length;
            const failCount = deploymentResults.filter(r => r.status === 'failed').length;

            console.log(`📊 Deployment summary: ${successCount} successful, ${failCount} failed`);

            if (failCount > 0) {
                const failedWorkflows = deploymentResults.filter(r => r.status === 'failed').map(r => r.workflow);
                throw new Error(`Some deployments failed: ${failedWorkflows.join(', ')}`);
            }

            return deploymentResults;
        } catch (error) {
            console.error(`❌ Deployment failed: ${error.message}`);
            throw error;
        }
    }

    async verifyDeployment(workflowNames) {
        console.log('🔍 Verifying production deployment');

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            const allWorkflows = await manager.getAllWorkflows();
            const verificationResults = [];

            for (const workflowName of workflowNames) {
                const prodWorkflowName = `${workflowName}-prod`;
                const prodWorkflow = allWorkflows.find(w => w.name === prodWorkflowName);

                if (!prodWorkflow) {
                    verificationResults.push({
                        workflow: workflowName,
                        verified: false,
                        error: `Production workflow not found: ${prodWorkflowName}`
                    });
                } else {
                    verificationResults.push({
                        workflow: workflowName,
                        verified: true,
                        prodWorkflow: prodWorkflow,
                        active: prodWorkflow.active,
                        nodeCount: prodWorkflow.nodes?.length || 0
                    });
                    console.log(`✅ Verified: ${prodWorkflowName} (Status: ${prodWorkflow.active ? 'Active' : 'Inactive'})`);
                }
            }

            const failedVerifications = verificationResults.filter(r => !r.verified);
            if (failedVerifications.length > 0) {
                const errors = failedVerifications.map(f => f.error).join(', ');
                throw new Error(`Verification failed: ${errors}`);
            }

            console.log(`✅ All ${workflowNames.length} workflows verified successfully`);
            return verificationResults;
        } catch (error) {
            console.error(`❌ Deployment verification failed: ${error.message}`);
            throw error;
        }
    }

    generateDeploymentSummary(deploymentData) {
        const {
            workflowNames,
            deployedBy,
            commitSha,
            backupName,
            skipBackup,
            deploymentResults,
            verificationResults
        } = deploymentData;

        let summary = `## Production Deployment Summary\n\n`;
        summary += `**Deployed workflows:** ${workflowNames.join(', ')}\n`;
        summary += `**Deployed by:** ${deployedBy}\n`;
        summary += `**Date:** ${new Date().toUTCString()}\n`;
        summary += `**Commit:** ${commitSha}\n`;
        summary += `**Backup created:** ${!skipBackup ? 'Yes' : 'No'}\n`;

        if (!skipBackup && backupName) {
            summary += `**Backup name:** ${backupName}\n\n`;
            summary += `### Rollback Instructions\n`;
            summary += `If issues occur, you can restore from the backup:\n`;
            summary += `\`\`\`bash\n`;
            summary += `npm run backup:restore ${backupName}\n`;
            summary += `\`\`\`\n`;
            summary += `Or use GitHub Actions: Emergency Restore workflow\n\n`;
        }

        summary += `**⚠️ Important:** All deployed workflows are imported as INACTIVE for safety.\n`;
        summary += `Please manually activate them in n8n after verification.\n\n`;

        // Add deployment results
        if (deploymentResults && deploymentResults.length > 0) {
            summary += `### Deployment Results\n`;
            for (const result of deploymentResults) {
                const status = result.status === 'success' ? '✅' : '❌';
                summary += `- ${status} ${result.workflow}\n`;
            }
            summary += `\n`;
        }

        // Add verification results
        if (verificationResults && verificationResults.length > 0) {
            summary += `### Verification Results\n`;
            for (const result of verificationResults) {
                if (result.verified) {
                    summary += `- ✅ ${result.workflow} (${result.nodeCount} nodes, ${result.active ? 'Active' : 'Inactive'})\n`;
                } else {
                    summary += `- ❌ ${result.workflow} - ${result.error}\n`;
                }
            }
            summary += `\n`;
        }

        summary += `### Next Steps\n`;
        summary += `1. Go to your n8n Cloud instance\n`;
        summary += `2. Review the deployed workflows\n`;
        summary += `3. Test workflows in inactive state\n`;
        summary += `4. Manually activate workflows when ready\n`;
        summary += `5. Monitor first few executions\n`;

        return summary;
    }

    saveDeploymentSummary(deploymentData, filename = 'deployment-summary.md') {
        const summary = this.generateDeploymentSummary(deploymentData);
        fs.writeFileSync(filename, summary);
        console.log(`📄 Saved deployment summary to: ${filename}`);
        return filename;
    }

    findLatestReleaseTag(workflowName) {
        try {
            const tags = execSync(`git tag -l "${workflowName}-*"`, { encoding: 'utf8' });
            const tagList = tags.trim().split('\n').filter(t => t.trim());

            if (tagList.length === 0) {
                return null;
            }

            // Sort tags by version (simple string sort, could be improved with semver)
            const latestTag = tagList.sort().pop();
            console.log(`📋 Found latest tag for ${workflowName}: ${latestTag}`);
            return latestTag;
        } catch (error) {
            console.warn(`⚠️ Could not find tags for ${workflowName}: ${error.message}`);
            return null;
        }
    }

    updateReleaseWithDeploymentStatus(workflowNames, deploymentData) {
        console.log('🏷️ Updating releases with deployment status');

        const updates = [];

        for (const workflowName of workflowNames) {
            const latestTag = this.findLatestReleaseTag(workflowName);

            if (latestTag) {
                try {
                    const releaseNotes = this.generateReleaseNotes(workflowName, deploymentData);

                    // Note: In GitHub Actions, this would use gh CLI or GitHub API
                    console.log(`📝 Would update release ${latestTag} with deployment status`);
                    console.log(`Release notes:\n${releaseNotes}`);

                    updates.push({
                        tag: latestTag,
                        workflow: workflowName,
                        notes: releaseNotes,
                        success: true
                    });
                } catch (error) {
                    console.error(`❌ Failed to update release ${latestTag}: ${error.message}`);
                    updates.push({
                        tag: latestTag,
                        workflow: workflowName,
                        success: false,
                        error: error.message
                    });
                }
            } else {
                console.warn(`⚠️ No release tag found for ${workflowName}`);
                updates.push({
                    workflow: workflowName,
                    success: false,
                    error: 'No release tag found'
                });
            }
        }

        return updates;
    }

    generateReleaseNotes(workflowName, deploymentData) {
        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();
        const workflowFile = manager.generateFileName(workflowName);

        let notes = `## ${workflowName} Release\n\n`;
        notes += `**Deployment Status:** ✅ Successfully deployed to production\n`;
        notes += `**Deployed at:** ${new Date().toUTCString()}\n`;
        notes += `**Deployed by:** ${deploymentData.deployedBy}\n`;
        notes += `**Backup created:** ${deploymentData.backupName || 'No backup created'}\n\n`;

        notes += `### Files Deployed\n`;
        notes += `- workflows/${workflowFile}\n\n`;

        notes += `### Important Notes\n`;
        notes += `- Workflows imported as INACTIVE for safety\n`;
        notes += `- Manual activation required after verification\n`;
        notes += `- Backup available for rollback if needed\n`;

        return notes;
    }

    createDeploymentNotification(workflowNames, deploymentData) {
        const title = `✅ Production Deployment Completed: ${workflowNames.join(', ')}`;

        let body = `## Production Deployment Notification\n\n`;
        body += `**Status:** ✅ Successfully Completed\n`;
        body += `**Workflows:** ${workflowNames.join(', ')}\n`;
        body += `**Deployed by:** ${deploymentData.deployedBy}\n`;
        body += `**Date:** ${new Date().toUTCString()}\n\n`;

        body += `### Deployment Summary\n`;
        body += this.generateDeploymentSummary(deploymentData);
        body += `\n`;

        body += `### Required Actions\n`;
        body += `- [ ] Verify workflows in n8n Cloud interface\n`;
        body += `- [ ] Test workflows before activation\n`;
        body += `- [ ] Manually activate workflows when ready\n`;
        body += `- [ ] Monitor first executions\n`;
        body += `- [ ] Close this issue when verification complete\n\n`;

        body += `**Backup:** ${deploymentData.backupName || 'No backup created'}\n`;

        return {
            title,
            body,
            labels: ['deployment', 'production']
        };
    }
}

// CLI usage
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    const deploymentManager = new DeploymentManager();

    (async () => {
        try {
            switch (command) {
                case 'detect-workflows':
                    const beforeCommit = args[0];
                    const afterCommit = args[1];
                    const workflows = deploymentManager.detectWorkflowsToDeploy(beforeCommit, afterCommit);
                    console.log(`Detected workflows: ${workflows.join(',')}`);
                    break;

                case 'create-backup':
                    const environment = args[0] || 'prod';
                    const customName = args[1] || null;
                    const _backupName = await deploymentManager.createBackup(environment, customName);
                    console.log(`Created backup: ${_backupName}`);
                    break;

                case 'validate':
                    const workflowsToValidate = args[0] ? args[0].split(',') : [];
                    if (workflowsToValidate.length === 0) throw new Error('Workflow names required');
                    await deploymentManager.validateWorkflowsExist(workflowsToValidate);
                    break;

                case 'deploy':
                    const workflowsToDeploy = args[0] ? args[0].split(',') : [];
                    if (workflowsToDeploy.length === 0) throw new Error('Workflow names required');
                    const deployResults = await deploymentManager.deployWorkflows(workflowsToDeploy);
                    console.log('Deployment results:', JSON.stringify(deployResults, null, 2));
                    break;

                case 'verify':
                    const workflowsToVerify = args[0] ? args[0].split(',') : [];
                    if (workflowsToVerify.length === 0) throw new Error('Workflow names required');
                    const verifyResults = await deploymentManager.verifyDeployment(workflowsToVerify);
                    console.log('Verification results:', JSON.stringify(verifyResults, null, 2));
                    break;

                case 'full-deploy':
                    const deployWorkflows = args[0] ? args[0].split(',') : [];
                    const skipBackup = args[1] === 'true';
                    const deployedBy = args[2] || 'unknown';
                    const commitSha = args[3] || 'unknown';

                    if (deployWorkflows.length === 0) throw new Error('Workflow names required');

                    console.log(`🚀 Starting full deployment for: ${deployWorkflows.join(', ')}`);

                    // Create backup
                    let backupName = null;
                    if (!skipBackup) {
                        backupName = await deploymentManager.createBackup();
                    }

                    // Validate workflows
                    await deploymentManager.validateWorkflowsExist(deployWorkflows);

                    // Deploy workflows
                    const deploymentResults = await deploymentManager.deployWorkflows(deployWorkflows);

                    // Verify deployment
                    const verificationResults = await deploymentManager.verifyDeployment(deployWorkflows);

                    // Generate summary
                    const deploymentData = {
                        workflowNames: deployWorkflows,
                        deployedBy,
                        commitSha,
                        backupName,
                        skipBackup,
                        deploymentResults,
                        verificationResults
                    };

                    deploymentManager.saveDeploymentSummary(deploymentData);

                    console.log('✅ Full deployment completed successfully');
                    break;

                default:
                    console.log('Available commands:');
                    console.log('  detect-workflows [before-commit] [after-commit]');
                    console.log('  create-backup [environment] [custom-name]');
                    console.log('  validate <workflow1,workflow2,...>');
                    console.log('  deploy <workflow1,workflow2,...>');
                    console.log('  verify <workflow1,workflow2,...>');
                    console.log('  full-deploy <workflow1,workflow2,...> [skip-backup] [deployed-by] [commit-sha]');
            }
        } catch (error) {
            console.error(`❌ Command failed: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = DeploymentManager;