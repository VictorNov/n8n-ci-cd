#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class ExportManager {
    constructor() {
        // Initialize with workflow manager
        const WorkflowManager = require('./manage-workflows.js');
        this.workflowManager = new WorkflowManager();
    }

    async exportWorkflows(environment, specificWorkflows = null) {
        console.log(`📤 Starting export process for ${environment} environment`);

        try {
            // Ensure directories exist
            this.ensureDirectoriesExist();

            // Perform the export
            const results = await this.workflowManager.exportManagedWorkflows(environment, specificWorkflows);

            // Create detailed summary
            const summaryData = this.createDetailedSummary(results, environment, specificWorkflows);

            // Save summary to multiple locations for compatibility
            this.saveSummaryFiles(summaryData, environment);

            console.log(`✅ Export completed: ${results.length} workflows processed`);

            return {
                success: true,
                results: results,
                summary: summaryData
            };
        } catch (error) {
            console.error(`❌ Export failed: ${error.message}`);

            const errorSummary = {
                timestamp: new Date().toISOString(),
                environment: environment,
                success: false,
                error: error.message,
                totalWorkflows: 0,
                successful: 0,
                failed: 1
            };

            this.saveSummaryFiles(errorSummary, environment);

            throw error;
        }
    }

    ensureDirectoriesExist() {
        const directories = ['workflows', 'logs'];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        });
    }

    createDetailedSummary(results, environment, specificWorkflows) {
        const successful = results.filter(r => r.status === 'success');
        const failed = results.filter(r => r.status === 'failed');

        return {
            timestamp: new Date().toISOString(),
            environment: environment,
            success: failed.length === 0,
            exportType: specificWorkflows ? 'selective' : 'all',
            requestedWorkflows: specificWorkflows || [],
            totalWorkflows: results.length,
            successful: successful.length,
            failed: failed.length,
            workflows: results.map(r => ({
                name: r.name,
                baseName: r.baseName,
                fileName: r.fileName,
                status: r.status,
                active: r.active,
                nodeCount: r.nodeCount,
                error: r.error
            })),
            failedWorkflows: failed.map(f => ({
                name: f.name,
                error: f.error
            })),
            successfulWorkflows: successful.map(s => ({
                name: s.name,
                baseName: s.baseName,
                fileName: s.fileName,
                nodeCount: s.nodeCount
            }))
        };
    }

    saveSummaryFiles(summaryData, environment) {
        const logsPath = path.join('logs', `_export_summary_${environment}.json`);
        fs.writeFileSync(logsPath, JSON.stringify(summaryData, null, 2));

        console.log(`📊 Export summary saved to logs:`);
        console.log(`   - ${logsPath}`);
    }

    generateMarkdownSummary(summaryData) {
        let markdown = `## Development Workflow Export Summary\n\n`;
        markdown += `**Date:** ${new Date(summaryData.timestamp).toUTCString()}\n`;
        markdown += `**Environment:** ${summaryData.environment}\n`;
        markdown += `**Export Type:** ${summaryData.exportType === 'selective' ? 'Specific workflows' : 'All managed workflows'}\n`;

        if (summaryData.requestedWorkflows.length > 0) {
            markdown += `**Requested workflows:** ${summaryData.requestedWorkflows.join(', ')}\n`;
        }

        markdown += `**Status:** ${summaryData.success ? '✅ Success' : '❌ Failed'}\n\n`;

        markdown += `### Results\n`;
        markdown += `- **Total workflows:** ${summaryData.totalWorkflows}\n`;
        markdown += `- **Successful:** ${summaryData.successful}\n`;
        markdown += `- **Failed:** ${summaryData.failed}\n\n`;

        if (summaryData.successfulWorkflows.length > 0) {
            markdown += `### Successfully Exported Workflows\n`;
            summaryData.successfulWorkflows.forEach(w => {
                markdown += `- **${w.baseName}** (${w.nodeCount} nodes) → \`${w.fileName}\`\n`;
            });
            markdown += `\n`;
        }

        if (summaryData.failedWorkflows.length > 0) {
            markdown += `### Failed Exports\n`;
            summaryData.failedWorkflows.forEach(w => {
                markdown += `- **${w.name}**: ${w.error}\n`;
            });
            markdown += `\n`;
        }

        markdown += `### Next Steps\n`;
        markdown += `1. Review the exported workflow files\n`;
        markdown += `2. Commit changes to version control\n`;
        markdown += `3. Create release candidate when ready\n`;
        markdown += `4. Test workflows before production deployment\n`;

        return markdown;
    }

    saveMarkdownSummary(summaryData, filename = 'export-summary.md') {
        const markdown = this.generateMarkdownSummary(summaryData);
        fs.writeFileSync(filename, markdown);
        console.log(`📄 Markdown summary saved: ${filename}`);
        return filename;
    }
}

// CLI usage
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    const exportManager = new ExportManager();

    (async () => {
        try {
            switch (command) {
                case 'export':
                    const environment = args[0] || 'dev';
                    const specificWorkflows = args.slice(1);

                    const result = await exportManager.exportWorkflows(
                        environment,
                        specificWorkflows.length > 0 ? specificWorkflows : null
                    );

                    // Generate markdown summary
                    exportManager.saveMarkdownSummary(result.summary);

                    console.log('✅ Export process completed successfully');
                    break;

                case 'export-specific':
                    const env = args[0] || 'dev';
                    const workflowList = args[1] ? args[1].split(',').map(w => w.trim()) : [];

                    if (workflowList.length === 0) {
                        throw new Error('Please provide comma-separated workflow names');
                    }

                    const specificResult = await exportManager.exportWorkflows(env, workflowList);
                    exportManager.saveMarkdownSummary(specificResult.summary);

                    console.log('✅ Specific workflow export completed');
                    break;

                default:
                    console.log('Available commands:');
                    console.log('  export [environment] [workflow1] [workflow2] - Export workflows');
                    console.log('  export-specific <environment> <workflow1,workflow2> - Export specific workflows');
                    console.log('');
                    console.log('Examples:');
                    console.log('  node scripts/export-manager.js export dev');
                    console.log('  node scripts/export-manager.js export dev "Customer Onboarding" "Email Marketing"');
                    console.log('  node scripts/export-manager.js export-specific dev "Customer Onboarding,Email Marketing"');
            }
        } catch (error) {
            console.error(`❌ Export command failed: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = ExportManager;
