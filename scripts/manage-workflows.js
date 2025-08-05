#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class WorkflowManager {
    constructor() {
        this.config = JSON.parse(fs.readFileSync('config/n8n-config.json', 'utf8'));
        this.managedWorkflows = JSON.parse(fs.readFileSync('workflows/managed-workflows.json', 'utf8'));

        this.client = axios.create({
            baseURL: this.config.n8n.baseUrl,
            headers: {
                // this.config.n8n.apiKey - for github actions only, do not put your api key into config files!
                'X-N8N-API-KEY': this.config.n8n.apiKey || process.env.N8N_API_KEY,
                'Content-Type': 'application/json'
            }
        });
    }

    async getAllWorkflows() {
        try {
            const response = await this.client.get('/api/v1/workflows');
            return response.data.data;
        } catch (error) {
            console.error('❌ Failed to fetch workflows:', error.response?.data || error.message);
            throw error;
        }
    }

    async getManagedWorkflows(environment = null) {
        const allWorkflows = await this.getAllWorkflows();
        const managedNames = this.getManagedWorkflowNames(environment);

        return allWorkflows.filter(workflow =>
            managedNames.includes(workflow.name)
        );
    }

    getManagedWorkflowNames(environment = null) {
        const names = [];
        const suffix = environment ? this.getSuffix(environment) : '';

        for (const workflow of this.managedWorkflows.managedWorkflows) {
            if (environment) {
                if (workflow.environments.includes(environment)) {
                    names.push(workflow.baseName + suffix);
                }
            } else {
                // Get all environments for this workflow
                for (const env of workflow.environments) {
                    names.push(workflow.baseName + this.getSuffix(env));
                }
            }
        }

        return names;
    }

    getSuffix(environment) {
        const suffixes = {
            'dev': this.managedWorkflows.settings.devSuffix,
            'prod': this.managedWorkflows.settings.prodSuffix,
            'staging': this.managedWorkflows.settings.stagingSuffix
        };
        return suffixes[environment] || '';
    }

    getBaseNameFromWorkflowName(workflowName) {
        for (const suffix of Object.values(this.managedWorkflows.settings)) {
            if (suffix && workflowName.endsWith(suffix)) {
                return workflowName.substring(0, workflowName.length - suffix.length);
            }
        }
        return workflowName;
    }

    getEnvironmentFromWorkflowName(workflowName) {
        if (workflowName.endsWith(this.managedWorkflows.settings.devSuffix)) return 'dev';
        if (workflowName.endsWith(this.managedWorkflows.settings.prodSuffix)) return 'prod';
        if (workflowName.endsWith(this.managedWorkflows.settings.stagingSuffix)) return 'staging';
        return 'unknown';
    }

    async exportManagedWorkflows(environment, specificWorkflows = null) {
        console.log(`🔄 Exporting managed workflows for ${environment}...`);

        let workflowsToExport;

        if (specificWorkflows) {
            // Export specific workflows by base name
            workflowsToExport = await this.getSpecificWorkflows(specificWorkflows, environment);
        } else {
            // Export all managed workflows for environment
            workflowsToExport = await this.getManagedWorkflows(environment);
        }

        console.log(`📋 Found ${workflowsToExport.length} workflows to export`);

        const exportResults = [];
        const exportDir = path.join('workflows', 'exported');
        fs.mkdirSync(exportDir, { recursive: true });

        for (const workflow of workflowsToExport) {
            try {
                const exportResult = await this.exportSingleWorkflow(workflow, exportDir);
                exportResults.push(exportResult);
                console.log(`✅ Exported: ${workflow.name}`);
            } catch (error) {
                console.error(`❌ Failed to export ${workflow.name}:`, error.message);
                exportResults.push({
                    name: workflow.name,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        // Create export summary
        this.createExportSummary(exportResults, environment);
        return exportResults;
    }

    async getSpecificWorkflows(workflowBaseNames, environment) {
        const allWorkflows = await this.getAllWorkflows();
        const suffix = this.getSuffix(environment);

        const specificNames = workflowBaseNames.map(baseName => baseName + suffix);

        return allWorkflows.filter(workflow =>
            specificNames.includes(workflow.name)
        );
    }

    async exportSingleWorkflow(workflow, exportDir) {
        const response = await this.client.get(`/api/v1/workflows/${workflow.id}`);
        const fullWorkflow = response.data.data;

        // Clean workflow data
        const cleanWorkflow = {
            ...fullWorkflow,
            id: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            versionId: undefined
        };

        // Generate filename based on workflow name
        const fileName = this.generateFileName(workflow.name);
        const filePath = path.join(exportDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(cleanWorkflow, null, 2));

        return {
            name: workflow.name,
            baseName: this.getBaseNameFromWorkflowName(workflow.name),
            environment: this.getEnvironmentFromWorkflowName(workflow.name),
            fileName: fileName,
            status: 'success',
            active: workflow.active,
            nodeCount: workflow.nodes?.length || 0
        };
    }

    generateFileName(workflowName) {
        return workflowName
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase() + '.json';
    }

    async syncDevToProd(workflowBaseNames) {
        console.log(`🔄 Syncing workflows from dev to prod...`);

        // First, export dev versions
        const devWorkflows = await this.getSpecificWorkflows(workflowBaseNames, 'dev');

        if (devWorkflows.length === 0) {
            console.log('❌ No dev workflows found to sync');
            return [];
        }

        const syncResults = [];

        for (const devWorkflow of devWorkflows) {
            try {
                const result = await this.syncSingleWorkflow(devWorkflow);
                syncResults.push(result);
            } catch (error) {
                console.error(`❌ Failed to sync ${devWorkflow.name}:`, error.message);
                syncResults.push({
                    baseName: this.getBaseNameFromWorkflowName(devWorkflow.name),
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return syncResults;
    }

    async syncSingleWorkflow(devWorkflow) {
        const baseName = this.getBaseNameFromWorkflowName(devWorkflow.name);
        const prodWorkflowName = baseName + this.getSuffix('prod');

        console.log(`🔄 Syncing: ${devWorkflow.name} → ${prodWorkflowName}`);

        // Get dev workflow details
        const devResponse = await this.client.get(`/api/v1/workflows/${devWorkflow.id}`);
        const devWorkflowData = devResponse.data;

        // Clean and prepare for prod
        const prodWorkflowData = {
            ...devWorkflowData,
            id: undefined,
            name: prodWorkflowName,
            active: undefined,
            isArchived: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            versionId: undefined,
            meta: undefined,
            pinData: undefined,
            triggerCount: undefined,
            shared: undefined,
            tags: undefined,
        };

        // Check if prod version already exists
        const allWorkflows = await this.getAllWorkflows();
        const existingProdWorkflow = allWorkflows.find(w => w.name === prodWorkflowName);

        let result;
        if (existingProdWorkflow) {
            // Update existing prod workflow
            const updateResponse = await this.client.put(`/api/v1/workflows/${existingProdWorkflow.id}`, prodWorkflowData);
            result = {
                baseName: baseName,
                action: 'updated',
                status: 'success',
                devName: devWorkflow.name,
                prodName: prodWorkflowName,
                prodId: existingProdWorkflow.id
            };
        } else {
            // Create new prod workflow
            const createResponse = await this.client.post('/api/v1/workflows', prodWorkflowData);
            result = {
                baseName: baseName,
                action: 'created',
                status: 'success',
                devName: devWorkflow.name,
                prodName: prodWorkflowName,
                prodId: createResponse.data.data.id
            };
        }

        console.log(`✅ ${result.action}: ${prodWorkflowName}`);
        return result;
    }

    createExportSummary(results, environment) {
        const summary = {
            timestamp: new Date().toISOString(),
            environment: environment,
            totalWorkflows: results.length,
            successful: results.filter(r => r.status === 'success').length,
            failed: results.filter(r => r.status === 'failed').length,
            workflows: results
        };

        const summaryPath = path.join('workflows', 'exported', `_export_summary_${environment}.json`);
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`📊 Export summary saved: ${summaryPath}`);
    }

    // CLI interface methods
    async handleCommand(command, args) {
        try {
            switch (command) {
                case 'export':
                    const environment = args[0] || 'dev';
                    const specificWorkflows = args.slice(1);
                    return await this.exportManagedWorkflows(environment, specificWorkflows.length > 0 ? specificWorkflows : null);

                case 'sync':
                    const workflowsToSync = args.length > 0 ? args : null;
                    if (!workflowsToSync) {
                        throw new Error('Please specify workflow base names to sync');
                    }
                    return await this.syncDevToProd(workflowsToSync);

                case 'list':
                    const listEnv = args[0] || null;
                    const workflows = await this.getManagedWorkflows(listEnv);
                    console.log(`📋 Managed workflows${listEnv ? ` (${listEnv})` : ''}:`);
                    workflows.forEach(w => {
                        const env = this.getEnvironmentFromWorkflowName(w.name);
                        const status = w.active ? 'Active: 🟢 | ' : 'Active: 🔴 | ';
                        console.log(`  ${status} ${w.name} (${env})`);
                    });
                    return workflows;

                case 'status':
                    return await this.getWorkflowStatus();

                default:
                    console.log('Available commands:');
                    console.log('  export [environment] [workflow1] [workflow2] - Export specific or all managed workflows');
                    console.log('  sync [workflow1] [workflow2] - Sync dev workflows to prod');
                    console.log('  list [environment] - List managed workflows');
                    console.log('  status - Show status of all managed workflows');
            }
        } catch (error) {
            console.error(`❌ Command failed:`, error.message);
            process.exit(1);
        }
    }

    async getWorkflowStatus() {
        console.log('📊 Workflow Status Report');
        console.log('========================');

        const managedConfigs = this.managedWorkflows.managedWorkflows;
        const allWorkflows = await this.getAllWorkflows();

        for (const config of managedConfigs) {
            console.log(`\n📁 ${config.baseName}`);

            for (const env of config.environments) {
                const workflowName = config.baseName + this.getSuffix(env);
                const workflow = allWorkflows.find(w => w.name === workflowName);

                if (workflow) {
                    const status = workflow.active ? '🟢 Active' : '🔴 Inactive';
                    console.log(`  ${env}: ${status} (${workflow.nodes?.length || 0} nodes)`);
                } else {
                    console.log(`  ${env}: ❌ Not found`);
                }
            }
        }

        return { managedConfigs, allWorkflows };
    }
}

// CLI usage
if (require.main === module) {
    const [,, command, ...args] = process.argv;

    if (!command) {
        console.log('Usage: node manage-workflows.js <command> [args...]');
        console.log('Commands: export, sync, list, status');
        process.exit(1);
    }

    const manager = new WorkflowManager();
    manager.handleCommand(command, args);
}

module.exports = WorkflowManager;
