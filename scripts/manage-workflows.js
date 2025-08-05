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
        const fullWorkflow = response.data;

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
                prodId: createResponse.data.id
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

                case 'backup':
                    const backupEnv = args[0] || 'prod';
                    const customName = args[1] || null;
                    return await this.createBackup(backupEnv, customName);

                case 'list-backups':
                    return await this.listBackups();

                case 'restore':
                    const backupName = args[0];
                    if (!backupName) {
                        throw new Error('Please specify backup name to restore from');
                    }
                    const workflowsToRestore = args.slice(1);
                    return await this.restoreFromBackup(backupName, workflowsToRestore.length > 0 ? workflowsToRestore : null);

                case 'cleanup-backups':
                    const keepCount = args[0] ? parseInt(args[0]) : 10;
                    return await this.cleanupOldBackups(keepCount);

                default:
                    console.log('Available commands:');
                    console.log('  export [environment] [workflow1] [workflow2] - Export specific or all managed workflows');
                    console.log('  sync [workflow1] [workflow2] - Sync dev workflows to prod');
                    console.log('  list [environment] - List managed workflows');
                    console.log('  status - Show status of all managed workflows');
                    console.log('  backup [environment] [custom-name] - Create backup of workflows');
                    console.log('  list-backups - List available backups');
                    console.log('  restore [backup-name] [workflow1] [workflow2] - Restore from backup');
                    console.log('  cleanup-backups [keep-count] - Cleanup old backups (default: keep 10)');
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

    async listBackups() {
        const backupsDir = path.join('workflows', 'backups');

        if (!fs.existsSync(backupsDir)) {
            console.log('📁 No backup directory found');
            return [];
        }

        const backupDirs = fs.readdirSync(backupsDir)
            .filter(item => {
                const itemPath = path.join(backupsDir, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .sort((a, b) => b.localeCompare(a)); // Sort newest first

        console.log('📦 Available Backups:');
        console.log('====================');

        if (backupDirs.length === 0) {
            console.log('No backups found');
            return [];
        }

        const backupInfo = [];

        for (const backupDir of backupDirs) {
            const backupPath = path.join(backupsDir, backupDir);
            const stats = fs.statSync(backupPath);

            // Parse backup directory name to extract timestamp
            const timestampMatch = backupDir.match(/backup_prod_(\d{8}_\d{6})/);
            const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';

            // Count workflows in backup
            let workflowCount = 0;
            try {
                const files = fs.readdirSync(backupPath);
                workflowCount = files.filter(f => f.endsWith('.json') && !f.startsWith('_')).length;
            } catch (error) {
                workflowCount = 0;
            }

            const backupData = {
                name: backupDir,
                timestamp: timestamp,
                created: stats.birthtime,
                workflowCount: workflowCount,
                path: backupPath
            };

            backupInfo.push(backupData);

            const formattedDate = stats.birthtime.toLocaleString();
            console.log(`  📦 ${backupDir}`);
            console.log(`     Created: ${formattedDate}`);
            console.log(`     Workflows: ${workflowCount}`);
            console.log('');
        }

        return backupInfo;
    }

    async restoreFromBackup(backupName, specificWorkflows = null) {
        console.log(`🔄 Restoring workflows from backup: ${backupName}`);

        const backupPath = path.join('workflows', 'backups', backupName);

        if (!fs.existsSync(backupPath)) {
            throw new Error(`Backup not found: ${backupName}`);
        }

        // Get list of workflow files in backup
        const backupFiles = fs.readdirSync(backupPath)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));

        if (backupFiles.length === 0) {
            throw new Error('No workflow files found in backup');
        }

        console.log(`📋 Found ${backupFiles.length} workflows in backup`);

        // Filter workflows if specific ones requested
        let workflowsToRestore = backupFiles;
        if (specificWorkflows && specificWorkflows.length > 0) {
            const specificFiles = specificWorkflows.map(baseName => {
                const prodName = baseName + this.getSuffix('prod');
                return this.generateFileName(prodName);
            });

            workflowsToRestore = backupFiles.filter(file => {
                return specificFiles.some(specificFile => file === specificFile);
            });

            console.log(`🎯 Filtering to ${workflowsToRestore.length} specific workflows`);
        }

        if (workflowsToRestore.length === 0) {
            console.log('❌ No matching workflows found in backup');
            return [];
        }

        // Get current workflows for comparison
        const currentWorkflows = await this.getAllWorkflows();
        const restoreResults = [];

        for (const backupFile of workflowsToRestore) {
            try {
                const result = await this.restoreSingleWorkflow(backupPath, backupFile, currentWorkflows);
                restoreResults.push(result);
            } catch (error) {
                console.error(`❌ Failed to restore ${backupFile}:`, error.message);
                restoreResults.push({
                    fileName: backupFile,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        // Create restore summary
        this.createRestoreSummary(restoreResults, backupName);

        console.log(`✅ Restore completed: ${restoreResults.filter(r => r.status === 'success').length} successful, ${restoreResults.filter(r => r.status === 'failed').length} failed`);

        return restoreResults;
    }

    async restoreSingleWorkflow(backupPath, backupFile, currentWorkflows) {
        const backupFilePath = path.join(backupPath, backupFile);
        const workflowData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));

        if (!workflowData.name) {
            throw new Error('Workflow data missing name field');
        }

        console.log(`🔄 Restoring: ${workflowData.name}`);

        // Find existing workflow with same name
        const existingWorkflow = currentWorkflows.find(w => w.name === workflowData.name);

        // Clean workflow data for restore
        const cleanWorkflowData = {
            ...workflowData,
            id: undefined,
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

        let result;
        if (existingWorkflow) {
            // Update existing workflow
            const updateResponse = await this.client.put(`/api/v1/workflows/${existingWorkflow.id}`, cleanWorkflowData);
            result = {
                fileName: backupFile,
                workflowName: workflowData.name,
                action: 'updated',
                status: 'success',
                workflowId: existingWorkflow.id,
                previouslyActive: existingWorkflow.active
            };
            console.log(`  ✅ Updated: ${workflowData.name} (was ${existingWorkflow.active ? 'active' : 'inactive'})`);
        } else {
            // Create new workflow
            const createResponse = await this.client.post('/api/v1/workflows', cleanWorkflowData);
            result = {
                fileName: backupFile,
                workflowName: workflowData.name,
                action: 'created',
                status: 'success',
                workflowId: createResponse.data.id,
                previouslyActive: false
            };
            console.log(`  ✅ Created: ${workflowData.name}`);
        }

        return result;
    }

    createRestoreSummary(results, backupName) {
        const summary = {
            restoredAt: new Date().toISOString(),
            backupName: backupName,
            totalWorkflows: results.length,
            successful: results.filter(r => r.status === 'success').length,
            failed: results.filter(r => r.status === 'failed').length,
            results: results.map(r => ({
                workflowName: r.workflowName || r.fileName,
                action: r.action,
                status: r.status,
                error: r.error,
                previouslyActive: r.previouslyActive
            }))
        };

        const summaryPath = path.join('workflows', 'backups', `_restore_summary_${Date.now()}.json`);
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`📊 Restore summary saved: ${summaryPath}`);

        // Also log summary to console
        console.log('\n📊 Restore Summary:');
        console.log(`   Backup: ${backupName}`);
        console.log(`   Total: ${summary.totalWorkflows}, Success: ${summary.successful}, Failed: ${summary.failed}`);
    }

    async createBackup(environment = 'prod', customName = null) {
        console.log(`💾 Creating backup of ${environment} workflows...`);

        // Generate backup name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
        const backupName = customName || `backup_${environment}_${timestamp.replace(/[-T]/g, '_')}`;
        const backupDir = path.join('workflows', 'backups', backupName);

        // Create backup directory
        fs.mkdirSync(backupDir, { recursive: true });

        // Export workflows to backup directory
        const workflowsToBackup = await this.getManagedWorkflows(environment);

        if (workflowsToBackup.length === 0) {
            console.log(`❌ No ${environment} workflows found to backup`);
            return null;
        }

        console.log(`📋 Backing up ${workflowsToBackup.length} workflows`);

        const backupResults = [];

        for (const workflow of workflowsToBackup) {
            try {
                const result = await this.exportSingleWorkflow(workflow, backupDir);
                backupResults.push(result);
                console.log(`  ✅ Backed up: ${workflow.name}`);
            } catch (error) {
                console.error(`  ❌ Failed to backup ${workflow.name}:`, error.message);
                backupResults.push({
                    name: workflow.name,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        // Create backup metadata
        const metadata = {
            backupName: backupName,
            environment: environment,
            createdAt: new Date().toISOString(),
            workflowCount: backupResults.filter(r => r.status === 'success').length,
            failedCount: backupResults.filter(r => r.status === 'failed').length,
            workflows: backupResults
        };

        fs.writeFileSync(path.join(backupDir, '_backup_metadata.json'), JSON.stringify(metadata, null, 2));

        console.log(`✅ Backup created: ${backupName}`);
        console.log(`📁 Location: ${backupDir}`);

        return {
            backupName,
            backupDir,
            metadata
        };
    }

    async cleanupOldBackups(keepCount = 10) {
        const backupsDir = path.join('workflows', 'backups');

        if (!fs.existsSync(backupsDir)) {
            console.log('📁 No backups directory found');
            return;
        }

        const backupDirs = fs.readdirSync(backupsDir)
            .filter(item => {
                const itemPath = path.join(backupsDir, item);
                return fs.statSync(itemPath).isDirectory() && item.startsWith('backup_');
            })
            .map(dir => ({
                name: dir,
                path: path.join(backupsDir, dir),
                created: fs.statSync(path.join(backupsDir, dir)).birthtime
            }))
            .sort((a, b) => b.created - a.created); // Sort newest first

        if (backupDirs.length <= keepCount) {
            console.log(`📦 ${backupDirs.length} backups found, no cleanup needed (keeping ${keepCount})`);
            return;
        }

        const backupsToDelete = backupDirs.slice(keepCount);
        console.log(`🧹 Cleaning up ${backupsToDelete.length} old backups (keeping ${keepCount} newest)`);

        for (const backup of backupsToDelete) {
            try {
                fs.rmSync(backup.path, { recursive: true, force: true });
                console.log(`  🗑️  Deleted: ${backup.name}`);
            } catch (error) {
                console.error(`  ❌ Failed to delete ${backup.name}:`, error.message);
            }
        }

        console.log('✅ Backup cleanup completed');
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
