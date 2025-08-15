#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class SuffixAwareValidator {
    constructor() {
        this.managedWorkflows = JSON.parse(fs.readFileSync('config/managed-workflows.json', 'utf8'));
        this.errors = [];
        this.warnings = [];
    }

    validateExportedWorkflows() {
        const exportDir = path.join('workflows', 'exported');

        if (!fs.existsSync(exportDir)) {
            console.error('❌ No exported workflows found');
            process.exit(1);
        }

        const files = fs.readdirSync(exportDir)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));

        console.log(`🔍 Validating ${files.length} exported workflows...`);

        for (const file of files) {
            this.validateWorkflowFile(path.join(exportDir, file));
        }

        this.reportResults();

        if (this.errors.length > 0) {
            process.exit(1);
        }
    }

    validateWorkflowFile(filePath) {
        const fileName = path.basename(filePath);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const workflow = JSON.parse(content);

            // Basic validation
            this.validateBasicStructure(workflow, fileName);

            // Suffix validation
            this.validateWorkflowSuffix(workflow, fileName);

            // Cross-environment consistency
            this.validateCrossEnvironmentConsistency(workflow, fileName);

            // Node validation
            this.validateNodes(workflow, fileName);

        } catch (error) {
            this.errors.push({
                file: fileName,
                error: `Invalid JSON: ${error.message}`
            });
        }
    }

    validateBasicStructure(workflow, fileName) {
        const required = ['name', 'nodes', 'connections'];

        for (const field of required) {
            if (!workflow[field]) {
                this.errors.push({
                    file: fileName,
                    error: `Missing required field: ${field}`
                });
            }
        }
    }

    validateWorkflowSuffix(workflow, fileName) {
        if (!workflow.name) return;

        const validSuffixes = [
            '-dev',
            '-prod',
        ].filter(Boolean);

        const hasValidSuffix = validSuffixes.some(suffix =>
            workflow.name.endsWith(suffix)
        );

        if (!hasValidSuffix) {
            this.warnings.push({
                file: fileName,
                warning: `Workflow name "${workflow.name}" doesn't follow suffix convention`
            });
        } else {
            // Check if it's a managed workflow
            const baseName = this.getBaseName(workflow.name);
            const isManaged = this.managedWorkflows.managedWorkflows.some(mw =>
                mw.baseName === baseName
            );

            if (!isManaged) {
                this.warnings.push({
                    file: fileName,
                    warning: `Workflow "${workflow.name}" is not in managed workflows list`
                });
            }
        }
    }

    validateCrossEnvironmentConsistency(workflow, fileName) {
        if (!workflow.name) return;

        const baseName = this.getBaseName(workflow.name);
        const environment = this.getEnvironment(workflow.name);

        if (environment === 'unknown') return;

        // Find the managed workflow config
        const managedConfig = this.managedWorkflows.managedWorkflows.find(mw =>
            mw.baseName === baseName
        );

        if (managedConfig) {
            // Check if this environment is expected for this workflow
            if (!['dev', 'prod'].includes(environment)) {
                this.warnings.push({
                    file: fileName,
                    warning: `Environment "${environment}" not configured for workflow "${baseName}"`
                });
            }

            // Check for environment-specific issues
            if (environment === 'prod') {
                // Production workflows should not have test/debug content
                if (this.hasTestContent(workflow)) {
                    this.errors.push({
                        file: fileName,
                        error: `Production workflow contains test/debug content`
                    });
                }
            }
        }
    }

    validateNodes(workflow, fileName) {
        if (!Array.isArray(workflow.nodes)) return;

        const nodeNames = new Set();

        for (const node of workflow.nodes) {
            if (!node.name || !node.type) {
                this.errors.push({
                    file: fileName,
                    error: `Node missing name or type: ${JSON.stringify(node)}`
                });
                continue;
            }

            // Check for duplicate node names
            if (nodeNames.has(node.name)) {
                this.errors.push({
                    file: fileName,
                    error: `Duplicate node name: ${node.name}`
                });
            }
            nodeNames.add(node.name);

            // Environment-specific node validation
            const environment = this.getEnvironment(workflow.name);
            this.validateNodeForEnvironment(node, environment, fileName);
        }
    }

    validateNodeForEnvironment(node, environment, fileName) {
        // Production-specific validations
        if (environment === 'prod') {
            // Check for hardcoded test URLs
            if (node.parameters) {
                const params = JSON.stringify(node.parameters);
                if (params.includes('test.') || params.includes('localhost') || params.includes('127.0.0.1')) {
                    this.warnings.push({
                        file: fileName,
                        warning: `Node "${node.name}" may contain test URLs in production workflow`
                    });
                }
            }

            // Check for debug/test node names
            if (node.name.toLowerCase().includes('test') || node.name.toLowerCase().includes('debug')) {
                this.warnings.push({
                    file: fileName,
                    warning: `Node "${node.name}" has test/debug name in production workflow`
                });
            }
        }
    }

    hasTestContent(workflow) {
        const workflowStr = JSON.stringify(workflow);
        const testPatterns = [
            /test\./gi,
            /localhost/gi,
            /127\.0\.0\.1/gi,
            /debug/gi,
            /example\.com/gi
        ];

        return testPatterns.some(pattern => pattern.test(workflowStr));
    }

    getBaseName(workflowName) {
        const suffixes = [
            '-dev',
            '-prod',
        ].filter(Boolean);

        for (const suffix of suffixes) {
            if (workflowName.endsWith(suffix)) {
                return workflowName.substring(0, workflowName.length - suffix.length);
            }
        }
        return workflowName;
    }

    getEnvironment(workflowName) {
        if (workflowName.endsWith('-dev')) return 'dev';
        if (workflowName.endsWith('-prod')) return 'prod';
        return 'unknown';
    }

    reportResults() {
        console.log('\n📊 Validation Results:');

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ All workflows are valid!');
            return;
        }

        if (this.errors.length > 0) {
            console.log(`\n❌ ${this.errors.length} Error(s):`);
            for (const error of this.errors) {
                console.log(`   ${error.file}: ${error.error}`);
            }
        }

        if (this.warnings.length > 0) {
            console.log(`\n⚠️  ${this.warnings.length} Warning(s):`);
            for (const warning of this.warnings) {
                console.log(`   ${warning.file}: ${warning.warning}`);
            }
        }
    }
}

// CLI usage
if (require.main === module) {
    const validator = new SuffixAwareValidator();
    validator.validateExportedWorkflows();
}

module.exports = SuffixAwareValidator;
