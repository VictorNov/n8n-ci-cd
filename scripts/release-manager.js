#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ReleaseManager {
    constructor() {
        this.workingDir = process.cwd();
    }

    async validateWorkflow(workflowName) {
        console.log(`🔍 Validating workflow: ${workflowName}`);

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            const workflows = await manager.getAllWorkflows();
            const devWorkflow = workflows.find(w => w.name === `${workflowName}-dev`);

            if (!devWorkflow) {
                throw new Error(`Dev workflow not found: ${workflowName}-dev`);
            }

            console.log(`✅ Found dev workflow: ${workflowName}-dev`);
            return devWorkflow;
        } catch (error) {
            console.error(`❌ Validation failed: ${error.message}`);
            throw error;
        }
    }

    async exportWorkflow(workflowName) {
        console.log(`📤 Exporting workflow: ${workflowName}`);

        const WorkflowManager = require('./manage-workflows.js');
        const manager = new WorkflowManager();

        try {
            await manager.exportManagedWorkflows('dev', [workflowName]);
            console.log(`✅ Exported workflow: ${workflowName}`);
        } catch (error) {
            console.error(`❌ Export failed: ${error.message}`);
            throw error;
        }
    }

    ensureGitConfig() {
        try {
            // Check if user name is configured
            try {
                execSync('git config user.name', { stdio: 'ignore' });
            } catch (error) {
                // Set default git user name
                execSync('git config user.name "github-actions[bot]"');
                console.log('🔧 Set git user.name to github-actions[bot]');
            }

            // Check if user email is configured
            try {
                execSync('git config user.email', { stdio: 'ignore' });
            } catch (error) {
                // Set default git user email
                execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
                console.log('🔧 Set git user.email to github-actions[bot]@users.noreply.github.com');
            }
        } catch (error) {
            console.warn(`⚠️ Failed to configure git: ${error.message}`);
        }
    }

    ensureProdBranch() {
        console.log(`🌿 Ensuring prod branch exists`);

        // Ensure Git is configured
        this.ensureGitConfig();

        try {
            // Check if prod branch exists locally
            try {
                execSync('git show-ref --verify --quiet refs/heads/prod', { stdio: 'ignore' });
                console.log('✅ prod branch exists locally');
                return 'exists-local';
            } catch (error) {
                // Branch doesn't exist locally, check remote
            }

            // Check if prod branch exists remotely
            try {
                execSync('git show-ref --verify --quiet refs/remotes/origin/prod', { stdio: 'ignore' });
                console.log('✅ prod branch exists remotely, checking out');
                execSync('git checkout -b prod origin/prod');
                return 'exists-remote';
            } catch (error) {
                // Branch doesn't exist remotely either
            }

            // Create new prod branch
            console.log('📝 Creating new prod branch from main');
            execSync('git checkout -b prod');
            execSync('git push -u origin prod');
            return 'created';
        } catch (error) {
            console.error(`❌ Failed to ensure prod branch: ${error.message}`);
            throw error;
        } finally {
            // Always switch back to main
            try {
                execSync('git checkout main');
            } catch (error) {
                console.warn('⚠️ Failed to switch back to main branch');
            }
        }
    }

    getWorkflowFileName(workflowName) {
        try {
            // First try to use WorkflowManager if available
            const WorkflowManager = require('./manage-workflows.js');
            const manager = new WorkflowManager();

            if (typeof manager.generateFileName === 'function') {
                const filename = manager.generateFileName(workflowName);
                // Validate the filename format
                if (filename && typeof filename === 'string' && filename.endsWith('.json')) {
                    return filename;
                }
            }

            // If WorkflowManager doesn't work properly, use fallback
            return this.generateSimpleFileName(workflowName);
        } catch (error) {
            // Fallback to simple filename generation if WorkflowManager is not available
            console.warn(`⚠️ WorkflowManager not available, using fallback: ${error.message}`);
            return this.generateSimpleFileName(workflowName);
        }
    }

    sanitizeForGit(name) {
        // Convert to lowercase, replace spaces and special chars with hyphens, remove multiple hyphens
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-+/g, '-');
    }

    generateSimpleFileName(workflowName) {
        // Simple fallback filename generation
        return workflowName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') + '.json';
    }

    async analyzeWorkflowChanges(workflowName, version) {
        console.log(`🔍 Analyzing changes for workflow: ${workflowName}`);

        const workflowFile = this.getWorkflowFileName(workflowName);
        const workflowPath = path.join('workflows', workflowFile);

        const changeAnalysis = {
            workflowName,
            version,
            workflowFile,
            releaseDate: new Date().toISOString(),
            isNewWorkflow: false,
            changes: [],
            mainWorkflow: null,
            prodWorkflow: null
        };

        try {
            // Store current branch
            const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

            // Check if workflow exists in prod branch
            try {
                execSync('git checkout prod', { stdio: 'ignore' });
                const prodWorkflowExists = fs.existsSync(workflowPath);
                changeAnalysis.isNewWorkflow = !prodWorkflowExists;

                if (prodWorkflowExists) {
                    // Read prod version
                    changeAnalysis.prodWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
                    console.log('📋 Found existing prod version for comparison');
                } else {
                    console.log('📝 New workflow - no prod version exists');
                }
            } catch (error) {
                console.log('📝 New workflow - prod branch does not exist or workflow not found');
                changeAnalysis.isNewWorkflow = true;
            }

            // Switch back to original branch and read current version
            execSync(`git checkout ${currentBranch}`, { stdio: 'ignore' });

            if (fs.existsSync(workflowPath)) {
                changeAnalysis.mainWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
            } else {
                throw new Error(`Workflow file not found in main branch: ${workflowPath}`);
            }

            // Analyze changes if both versions exist
            if (!changeAnalysis.isNewWorkflow && changeAnalysis.prodWorkflow) {
                changeAnalysis.changes = this.compareWorkflows(
                    changeAnalysis.prodWorkflow,
                    changeAnalysis.mainWorkflow
                );
            }

            // Save analysis for later use
            this.saveChangelogToFile(changeAnalysis);

            return changeAnalysis;
        } catch (error) {
            // Make sure we're back on the original branch
            try {
                const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
                if (currentBranch !== 'main') {
                    execSync('git checkout main', { stdio: 'ignore' });
                }
            } catch (checkoutError) {
                console.warn('⚠️ Failed to switch back to main branch');
            }

            console.error(`❌ Failed to analyze changes: ${error.message}`);
            throw error;
        }
    }

    compareWorkflows(prodWorkflow, mainWorkflow) {
        const changes = [];

        // Compare node count
        const prodNodes = prodWorkflow.nodes ? prodWorkflow.nodes.length : 0;
        const mainNodes = mainWorkflow.nodes ? mainWorkflow.nodes.length : 0;

        if (prodNodes !== mainNodes) {
            changes.push({
                type: 'node_count',
                description: `Node count changed`,
                from: prodNodes,
                to: mainNodes
            });
        }

        // Compare node types
        if (prodWorkflow.nodes && mainWorkflow.nodes) {
            const prodTypes = new Set(prodWorkflow.nodes.map(n => n.type));
            const mainTypes = new Set(mainWorkflow.nodes.map(n => n.type));

            const addedTypes = [...mainTypes].filter(t => !prodTypes.has(t));
            const removedTypes = [...prodTypes].filter(t => !mainTypes.has(t));

            if (addedTypes.length > 0) {
                changes.push({
                    type: 'node_types_added',
                    description: `Added node types`,
                    details: addedTypes
                });
            }

            if (removedTypes.length > 0) {
                changes.push({
                    type: 'node_types_removed',
                    description: `Removed node types`,
                    details: removedTypes
                });
            }
        }

        // Compare active status
        if (prodWorkflow.active !== mainWorkflow.active) {
            changes.push({
                type: 'active_status',
                description: `Active status changed`,
                from: prodWorkflow.active,
                to: mainWorkflow.active
            });
        }

        // Compare tags
        const prodTags = (prodWorkflow.tags || []).map(t => t.name || t).sort();
        const mainTags = (mainWorkflow.tags || []).map(t => t.name || t).sort();

        if (JSON.stringify(prodTags) !== JSON.stringify(mainTags)) {
            changes.push({
                type: 'tags',
                description: `Tags changed`,
                from: prodTags,
                to: mainTags
            });
        }

        return changes;
    }

    generateChangelogMarkdown(changeAnalysis) {
        let markdown = '';

        if (changeAnalysis.isNewWorkflow) {
            markdown += `## New Workflow Release\n\n`;
            markdown += `**Workflow:** ${changeAnalysis.workflowName}\n`;
            markdown += `**Version:** ${changeAnalysis.version}\n`;
            markdown += `**Release Date:** ${new Date(changeAnalysis.releaseDate).toUTCString()}\n`;
            markdown += `**Type:** New workflow (first production release)\n\n`;

            if (changeAnalysis.mainWorkflow) {
                markdown += this.generateWorkflowDetails(changeAnalysis.mainWorkflow);
            }
        } else {
            markdown += `## Workflow Changes\n\n`;
            markdown += `**Workflow:** ${changeAnalysis.workflowName}\n`;
            markdown += `**Version:** ${changeAnalysis.version}\n`;
            markdown += `**Release Date:** ${new Date(changeAnalysis.releaseDate).toUTCString()}\n\n`;

            if (changeAnalysis.changes.length > 0) {
                markdown += `### Changes in this release:\n\n`;

                for (const change of changeAnalysis.changes) {
                    markdown += `**${change.description}:**\n`;

                    if (change.from !== undefined && change.to !== undefined) {
                        markdown += `- From: ${JSON.stringify(change.from)}\n`;
                        markdown += `- To: ${JSON.stringify(change.to)}\n`;
                    } else if (change.details) {
                        markdown += `- ${Array.isArray(change.details) ? change.details.join(', ') : change.details}\n`;
                    }
                    markdown += `\n`;
                }
            } else {
                markdown += `### No structural changes detected\n\n`;
                markdown += `This release may include internal workflow logic changes that are not visible in the structural comparison.\n\n`;
            }

            if (changeAnalysis.mainWorkflow) {
                markdown += `### Current Workflow Details:\n\n`;
                markdown += this.generateWorkflowDetails(changeAnalysis.mainWorkflow);
            }
        }

        return markdown;
    }

    generateWorkflowDetails(workflow) {
        let details = '';

        details += `**Node Count:** ${workflow.nodes ? workflow.nodes.length : 0} nodes\n`;
        details += `**Active Status:** ${workflow.active ? 'Active' : 'Inactive'}\n\n`;

        if (workflow.nodes && workflow.nodes.length > 0) {
            details += `**Node Types:**\n`;
            const nodeTypes = [...new Set(workflow.nodes.map(n => n.type))].sort();
            nodeTypes.forEach(type => {
                const count = workflow.nodes.filter(n => n.type === type).length;
                details += `- ${type} (${count})\n`;
            });
            details += `\n`;
        }

        details += `**Tags:**\n`;
        if (workflow.tags && workflow.tags.length > 0) {
            workflow.tags.forEach(tag => {
                details += `- ${tag.name || tag}\n`;
            });
        } else {
            details += `- No tags\n`;
        }
        details += `\n`;

        return details;
    }

    createReleaseTag(workflowName, version) {
        // Ensure Git is configured
        this.ensureGitConfig();

        // Sanitize workflow name for Git tag (no spaces, special chars)
        const sanitizedName = this.sanitizeForGit(workflowName);
        const tagName = `${sanitizedName}-${version}`;
        const message = `Release ${version} for workflow ${workflowName}`;

        console.error(`🏷️ Creating release tag: ${tagName}`);

        try {
            execSync(`git tag -a "${tagName}" -m "${message}"`);
            execSync(`git push origin "${tagName}"`);
            console.error(`✅ Created and pushed tag: ${tagName}`);
            return tagName;
        } catch (error) {
            console.error(`❌ Failed to create tag: ${error.message}`);
            throw error;
        }
    }

    createReleaseBranch(workflowName, version) {
        // Ensure Git is configured
        this.ensureGitConfig();

        // Sanitize workflow name for Git branch (no spaces, special chars)
        const sanitizedName = this.sanitizeForGit(workflowName);
        const branchName = `release-candidate/${sanitizedName}-${version}`;

        console.error(`🌿 Creating release candidate branch: ${branchName}`);

        try {
            execSync(`git checkout -b "${branchName}"`);

            // Create release metadata
            const releaseInfo = {
                workflow: workflowName,
                version: version,
                created: new Date().toISOString(),
                createdBy: process.env.GITHUB_ACTOR || 'unknown',
                branch: branchName
            };

            fs.writeFileSync('RELEASE_INFO.md', this.generateReleaseInfo(releaseInfo));

            execSync('git add RELEASE_INFO.md');
            execSync(`git commit -m "chore: create release candidate ${version} for ${workflowName}"`);
            execSync(`git push -u origin "${branchName}"`);

            console.error(`✅ Created release branch: ${branchName}`);
            return branchName;
        } catch (error) {
            console.error(`❌ Failed to create release branch: ${error.message}`);
            throw error;
        }
    }

    generateReleaseInfo(releaseInfo) {
        return `## Release Information

**Workflow:** ${releaseInfo.workflow}
**Version:** ${releaseInfo.version}
**Created:** ${releaseInfo.created}
**Created by:** ${releaseInfo.createdBy}
**Branch:** ${releaseInfo.branch}

This release candidate is ready for review and production deployment.
Merge the associated pull request to deploy to production.
`;
    }

    saveChangelogToFile(changeAnalysis, filename = 'workflow_changes.md') {
        const markdown = this.generateChangelogMarkdown(changeAnalysis);
        fs.writeFileSync(filename, markdown);
        console.log(`📄 Saved changelog to: ${filename}`);
        return filename;
    }

    getCurrentReleasedVersion(workflowName) {
        console.log(`🔍 Finding current released version for: ${workflowName}`);

        try {
            // Sanitize workflow name for Git operations
            const sanitizedName = this.sanitizeForGit(workflowName);

            // Get all tags for this workflow (using sanitized name)
            const tagsOutput = execSync(`git tag -l "${sanitizedName}-*"`, { encoding: 'utf8' });
            const tags = tagsOutput.trim().split('\n').filter(t => t.trim());

            if (tags.length === 0) {
                console.log(`📋 No previous releases found for ${workflowName} (searched for: ${sanitizedName}-*)`);
                return null;
            }

            // Extract versions and sort them
            const escapedName = sanitizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const versions = tags
                .map(tag => {
                    const match = tag.match(new RegExp(`^${escapedName}-(.+)$`));
                    return match ? { tag, version: match[1] } : null;
                })
                .filter(v => v !== null)
                .sort((a, b) => {
                    // Simple version comparison (could be improved with semver)
                    return this.compareVersions(b.version, a.version);
                });

            const currentVersion = versions[0];
            console.log(`✅ Current released version: ${currentVersion.version} (tag: ${currentVersion.tag})`);

            return currentVersion.version;
        } catch (error) {
            console.warn(`⚠️ Could not determine current version for ${workflowName}: ${error.message}`);
            return null;
        }
    }

    compareVersions(a, b) {
        // Simple version comparison - handles v1.2.3 format
        const cleanA = a.replace(/^v/, '');
        const cleanB = b.replace(/^v/, '');

        const partsA = cleanA.split('.').map(x => parseInt(x) || 0);
        const partsB = cleanB.split('.').map(x => parseInt(x) || 0);

        const maxLength = Math.max(partsA.length, partsB.length);

        for (let i = 0; i < maxLength; i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;

            if (numA > numB) return 1;
            if (numA < numB) return -1;
        }

        return 0;
    }

    suggestNextVersion(currentVersion) {
        if (!currentVersion) {
            return 'v1.0.0';
        }

        // Remove 'v' prefix if present
        const cleanVersion = currentVersion.replace(/^v/, '');
        const parts = cleanVersion.split('.').map(x => parseInt(x) || 0);

        // Suggest patch version increment
        const suggestions = {
            patch: `v${parts[0] || 1}.${parts[1] || 0}.${(parts[2] || 0) + 1}`,
            minor: `v${parts[0] || 1}.${(parts[1] || 0) + 1}.0`,
            major: `v${(parts[0] || 0) + 1}.0.0`
        };

        return suggestions.patch; // Default to patch increment
    }

    getAllManagedWorkflowsWithVersions() {
        console.log('📋 Getting all managed workflows with their current versions');

        const managedWorkflows = this.managedWorkflows || JSON.parse(fs.readFileSync('config/managed-workflows.json', 'utf8'));

        const workflowsWithVersions = managedWorkflows.managedWorkflows.map(workflow => {
            const currentVersion = this.getCurrentReleasedVersion(workflow.baseName);
            const suggestedVersion = this.suggestNextVersion(currentVersion);

            return {
                baseName: workflow.baseName,
                description: workflow.description,
                currentVersion: currentVersion || 'No releases',
                suggestedVersion: suggestedVersion,
                environments: workflow.environments
            };
        });

        return workflowsWithVersions;
    }

    generateWorkflowVersionSummary() {
        console.log('📊 Generating workflow version summary');

        const workflows = this.getAllManagedWorkflowsWithVersions();

        let summary = '# Workflow Version Summary\n\n';
        summary += `Generated at: ${new Date().toISOString()}\n\n`;
        summary += '| Workflow | Current Version | Suggested Next | Environments |\n';
        summary += '|----------|----------------|----------------|-------------|\n';

        workflows.forEach(w => {
            summary += `| ${w.baseName} | ${w.currentVersion} | ${w.suggestedVersion} | ${w.environments.join(', ')} |\n`;
        });

        return summary;
    }
}

// CLI usage
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    const releaseManager = new ReleaseManager();

    (async () => {
        try {
            switch (command) {
                case 'validate':
                    const workflowName = args[0];
                    if (!workflowName) throw new Error('Workflow name required');
                    await releaseManager.validateWorkflow(workflowName);
                    break;

                case 'export':
                    const exportWorkflow = args[0];
                    if (!exportWorkflow) throw new Error('Workflow name required');
                    await releaseManager.exportWorkflow(exportWorkflow);
                    break;

                case 'ensure-prod-branch':
                    const result = releaseManager.ensureProdBranch();
                    console.log(`Branch status: ${result}`);
                    break;

                case 'analyze':
                    const analyzeWorkflow = args[0];
                    const version = args[1];
                    if (!analyzeWorkflow || !version) throw new Error('Workflow name and version required');

                    const analysis = await releaseManager.analyzeWorkflowChanges(analyzeWorkflow, version);
                    console.log('Analysis:', JSON.stringify(analysis, null, 2));
                    break;

                case 'get-workflow-filename':
                    const filenameWorkflow = args[0];
                    if (!filenameWorkflow) throw new Error('Workflow name required');

                    try {
                        const filename = releaseManager.getWorkflowFileName(filenameWorkflow);
                        // Output only the filename, no extra text
                        process.stdout.write(filename);
                    } catch (error) {
                        // If there's an error, output the fallback filename
                        const fallbackFilename = releaseManager.generateSimpleFileName(filenameWorkflow);
                        process.stdout.write(fallbackFilename);
                    }
                    break;

                case 'create-tag':
                    const tagWorkflow = args[0];
                    const tagVersion = args[1];
                    if (!tagWorkflow || !tagVersion) throw new Error('Workflow name and version required');

                    const tag = releaseManager.createReleaseTag(tagWorkflow, tagVersion);
                    // Output only the tag name, no extra text
                    process.stdout.write(tag);
                    break;

                case 'create-branch':
                    const branchWorkflow = args[0];
                    const branchVersion = args[1];
                    if (!branchWorkflow || !branchVersion) throw new Error('Workflow name and version required');

                    const branch = releaseManager.createReleaseBranch(branchWorkflow, branchVersion);
                    // Output only the branch name, no extra text
                    process.stdout.write(branch);
                    break;

                case 'current-version':
                    const versionWorkflow = args[0];
                    if (!versionWorkflow) throw new Error('Workflow name required');

                    const currentVer = releaseManager.getCurrentReleasedVersion(versionWorkflow);
                    console.log(currentVer || 'No releases found');
                    break;

                case 'suggest-version':
                    const suggestWorkflow = args[0];
                    if (!suggestWorkflow) throw new Error('Workflow name required');

                    const current = releaseManager.getCurrentReleasedVersion(suggestWorkflow);
                    const suggested = releaseManager.suggestNextVersion(current);
                    console.log(suggested);
                    break;

                case 'list-versions':
                    const workflows = releaseManager.getAllManagedWorkflowsWithVersions();
                    console.table(workflows);
                    break;

                case 'version-summary':
                    const summary = releaseManager.generateWorkflowVersionSummary();
                    console.log(summary);
                    fs.writeFileSync('workflow-versions.md', summary);
                    break;

                default:
                    console.log('Available commands:');
                    console.log('  validate <workflow-name>');
                    console.log('  export <workflow-name>');
                    console.log('  ensure-prod-branch');
                    console.log('  analyze <workflow-name> <version>');
                    console.log('  get-workflow-filename <workflow-name>');
                    console.log('  create-tag <workflow-name> <version>');
                    console.log('  create-branch <workflow-name> <version>');
            }
        } catch (error) {
            console.error(`❌ Command failed: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = ReleaseManager;