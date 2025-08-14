#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class WorkflowDescriptionUpdater {
    constructor() {
        this.workflowPath = '.github/workflows/create-release-candidate.yml';
    }

    updateWorkflowDescription(workflowName) {
        console.log(`🔄 Updating workflow description for: ${workflowName}`);

        try {
            // Get current version
            const ReleaseManager = require('./release-manager.js');
            const releaseManager = new ReleaseManager();

            const currentVersion = releaseManager.getCurrentReleasedVersion(workflowName);
            const suggestedVersion = releaseManager.suggestNextVersion(currentVersion);

            // Read the workflow file
            const workflowContent = fs.readFileSync(this.workflowPath, 'utf8');

            // Parse YAML
            const workflow = yaml.load(workflowContent);

            // Update the version input description
            if (workflow.on && workflow.on.workflow_dispatch && workflow.on.workflow_dispatch.inputs) {
                const versionInput = workflow.on.workflow_dispatch.inputs.version;

                if (versionInput) {
                    const currentVersionText = currentVersion || 'No releases';
                    const newDescription = `Release version (current: ${currentVersionText}, suggested: ${suggestedVersion})`;

                    versionInput.description = newDescription;

                    console.log(`✅ Updated description: ${newDescription}`);
                } else {
                    console.warn('⚠️ Version input not found in workflow');
                    return false;
                }
            } else {
                console.warn('⚠️ Workflow dispatch inputs not found');
                return false;
            }

            // Write back to file
            const updatedContent = yaml.dump(workflow, {
                lineWidth: -1,
                noRefs: true,
                quotingType: '"',
                forceQuotes: false
            });

            fs.writeFileSync(this.workflowPath, updatedContent);
            console.log(`📝 Updated workflow file: ${this.workflowPath}`);

            return true;
        } catch (error) {
            console.error(`❌ Failed to update workflow description: ${error.message}`);
            return false;
        }
    }

    updateWorkflowDescriptionForAllWorkflows() {
        console.log('🔄 Updating workflow descriptions for all managed workflows');

        try {
            const ReleaseManager = require('./release-manager.js');
            const releaseManager = new ReleaseManager();

            const workflows = releaseManager.getAllManagedWorkflowsWithVersions();

            // Read the workflow file
            const workflowContent = fs.readFileSync(this.workflowPath, 'utf8');
            const workflow = yaml.load(workflowContent);

            // Create a summary of all workflows for the description
            let versionSummary = 'Release version. Current versions: ';
            const versionPairs = workflows.map(w => `${w.baseName} (${w.currentVersion})`);
            versionSummary += versionPairs.join(', ');

            // Update the version input description
            if (workflow.on?.workflow_dispatch?.inputs?.version) {
                workflow.on.workflow_dispatch.inputs.version.description = versionSummary;
                console.log(`✅ Updated description with all workflow versions`);
            }

            // Write back to file
            const updatedContent = yaml.dump(workflow, {
                lineWidth: -1,
                noRefs: true,
                quotingType: '"',
                forceQuotes: false
            });

            fs.writeFileSync(this.workflowPath, updatedContent);
            console.log(`📝 Updated workflow file with all versions`);

            return true;
        } catch (error) {
            console.error(`❌ Failed to update workflow description: ${error.message}`);
            return false;
        }
    }

    generateWorkflowChoices() {
        console.log('📋 Generating workflow choices with versions');

        try {
            const ReleaseManager = require('./release-manager.js');
            const releaseManager = new ReleaseManager();

            const workflows = releaseManager.getAllManagedWorkflowsWithVersions();

            // Read the workflow file
            const workflowContent = fs.readFileSync(this.workflowPath, 'utf8');
            const workflow = yaml.load(workflowContent);

            // Update workflow_name input to include version info in description
            if (workflow.on?.workflow_dispatch?.inputs?.workflow_name) {
                let description = 'Workflow base name for release. Available workflows:\n';
                workflows.forEach(w => {
                    description += `• ${w.baseName} (current: ${w.currentVersion}, suggested: ${w.suggestedVersion})\n`;
                });

                workflow.on.workflow_dispatch.inputs.workflow_name.description = description.trim();
                console.log(`✅ Updated workflow_name description with version info`);
            }

            // Write back to file
            const updatedContent = yaml.dump(workflow, {
                lineWidth: -1,
                noRefs: true,
                quotingType: '"',
                forceQuotes: false
            });

            fs.writeFileSync(this.workflowPath, updatedContent);
            console.log(`📝 Updated workflow file with version choices`);

            return true;
        } catch (error) {
            console.error(`❌ Failed to generate workflow choices: ${error.message}`);
            return false;
        }
    }
}

// CLI usage
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    // Add js-yaml dependency check
    try {
        require('js-yaml');
    } catch (error) {
        console.error('❌ js-yaml package required. Install with: npm install js-yaml');
        process.exit(1);
    }

    const updater = new WorkflowDescriptionUpdater();

    try {
        switch (command) {
            case 'update-version-description':
                const workflowName = args[0];
                if (!workflowName) throw new Error('Workflow name required');
                updater.updateWorkflowDescription(workflowName);
                break;

            case 'update-all-versions':
                updater.updateWorkflowDescriptionForAllWorkflows();
                break;

            case 'update-workflow-choices':
                updater.generateWorkflowChoices();
                break;

            default:
                console.log('Available commands:');
                console.log('  update-version-description <workflow-name>');
                console.log('  update-all-versions');
                console.log('  update-workflow-choices');
        }
    } catch (error) {
        console.error(`❌ Command failed: ${error.message}`);
        process.exit(1);
    }
}

module.exports = WorkflowDescriptionUpdater;
