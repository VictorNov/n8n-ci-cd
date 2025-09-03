#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class WorkflowManager {
    constructor() {
        this.config = JSON.parse(fs.readFileSync('config/n8n-config.json', 'utf8'));
        this.managedWorkflows = JSON.parse(fs.readFileSync('config/managed-workflows.json', 'utf8'));

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
                if (['dev', 'prod'].includes(environment)) {
                    names.push(workflow.baseName + suffix);
                }
            } else {
                // Get all environments for this workflow
                for (const env of ['dev', 'prod']) {
                    names.push(workflow.baseName + this.getSuffix(env));
                }
            }
        }

        return names;
    }

    getSuffix(environment) {
        const suffixes = {
            'dev': '-dev',
            'prod': '-prod',
        };
        return suffixes[environment] || '';
    }

    getBaseNameFromWorkflowName(workflowName) {
        // Check if the workflow name has a suffix and remove it
        if (workflowName.endsWith('-dev')) {
            return workflowName.substring(0, workflowName.length - 4);
        }
        if (workflowName.endsWith('-prod')) {
            return workflowName.substring(0, workflowName.length - 5);
        }
        return workflowName;
    }

    getEnvironmentFromWorkflowName(workflowName) {
        if (workflowName.endsWith('-dev')) return 'dev';
        if (workflowName.endsWith('-prod')) return 'prod';
        return 'dev'; // Default to dev if no suffix is found
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
        const exportDir = path.join('workflows');
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

        return allWorkflows.filter(workflow => {
            const baseName = this.getBaseNameFromWorkflowName(workflow.name);
            const workflowEnv = this.getEnvironmentFromWorkflowName(workflow.name);

            // Only include workflows that match both the base name and the environment
            return workflowBaseNames.includes(baseName) && workflowEnv === environment;
        });
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

        // Generate filename based on the workflow name
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
        // First, get the base name without any environment suffix
        const baseName = this.getBaseNameFromWorkflowName(workflowName);

        // Then convert to the filename format
        return baseName
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase() + '.json';
    }

    async deployDevToProd(workflowBaseNames) {
        console.log(`🔄 Deploying workflows from dev to prod...`);

        // Create a backup before deploying if enabled in settings
        if (this.config.settings.backupBeforeDeploy) {
            console.log(`💾 Creating backup before deploying to production...`);
            await this.createBackup('prod', `pre_deploy_auto_${new Date().toISOString().replace(/[:.]/g, '').split('T')[0]}_${new Date().toTimeString().split(' ')[0].replace(/:/g, '')}`);

            // Ensure cleanup runs after backup during deployment to production
            await this.cleanupOldBackups();
        }

        // First, export dev versions
        const devWorkflows = await this.getSpecificWorkflows(workflowBaseNames, 'dev');

        if (devWorkflows.length === 0) {
            console.log('❌ No dev workflows found to deploy');
            return [];
        }

        const deployResults = [];

        for (const devWorkflow of devWorkflows) {
            try {
                const result = await this.deploySingleWorkflow(devWorkflow);
                deployResults.push(result);
            } catch (error) {
                console.error(`❌ Failed to deploy ${devWorkflow.name}:`, error.message);
                deployResults.push({
                    baseName: this.getBaseNameFromWorkflowName(devWorkflow.name),
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return deployResults;
    }

    async deploySingleWorkflow(devWorkflow) {
        const baseName = this.getBaseNameFromWorkflowName(devWorkflow.name);
        // Add the prod suffix to the base name
        const prodWorkflowName = baseName + this.getSuffix('prod');

        console.log(`🔄 Deploying: ${devWorkflow.name} → ${prodWorkflowName}`);

        // Get dev workflow details
        const devWorkflowData = fs.readFileSync(path.join('workflows', this.generateFileName(devWorkflow.name)), 'utf8');
        const devWorkflowParsed = JSON.parse(devWorkflowData);

        // Clean and prepare for prod
        const prodWorkflowData = {
            ...devWorkflowParsed,
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

        // Inject environment variables if available
        this.injectEnvironmentVariables(prodWorkflowData, baseName, 'prod');

        // Clean node IDs to avoid conflicts
        this.cleanupNodeWebhookIds(prodWorkflowData);

        // Check if a prod version already exists
        const allWorkflows = await this.getAllWorkflows();
        const existingProdWorkflow = allWorkflows.find(w => w.name === prodWorkflowName);

        let result;
        if (existingProdWorkflow) {
            // Update the existing prod workflow
            await this.client.put(`/api/v1/workflows/${existingProdWorkflow.id}`, prodWorkflowData);
            result = {
                baseName: baseName,
                action: 'updated',
                status: 'success',
                devName: devWorkflow.name,
                prodName: prodWorkflowName,
                prodId: existingProdWorkflow.id
            };
        } else {
            // Create a new prod workflow
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

        const summaryPath = path.join('logs', `_export_summary_${environment}.json`);
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

                case 'import':
                    const importEnv = args[0] || 'dev';
                    const workflowsToImport = args.slice(1);
                    return await this.importLocalWorkflows(importEnv, workflowsToImport.length > 0 ? workflowsToImport : null);

                case 'deploy':
                    const workflowsToDeploy = args.length > 0 ? args : null;
                    if (!workflowsToDeploy) {
                        throw new Error('Please specify workflow base names to deploy');
                    }
                    return await this.deployDevToProd(workflowsToDeploy);

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
                    const keepCount = args[0] ? parseInt(args[0]) : this.config.settings.maxBackupsToKeep;
                    return await this.cleanupOldBackups(keepCount);

                default:
                    console.log('Available commands:');
                    console.log('  export [environment] [workflow1] [workflow2] - Export specific or all managed workflows');
                    console.log('  import [environment] [workflow1] [workflow2] - Import local workflow files to n8n');
                    console.log('  deploy [workflow1] [workflow2] - Deploy dev workflows to prod');
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

        // Get a list of workflow files in the backup
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
            // Update the existing workflow
            await this.client.put(`/api/v1/workflows/${existingWorkflow.id}`, cleanWorkflowData);
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
            // Create a new workflow
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
        const backupDir = path.join('backups', backupName);

        // Create a backup directory
        fs.mkdirSync(backupDir, { recursive: true });

        // Export workflows to a back-up directory
        const workflowsToBackup = await this.getManagedWorkflows(environment);

        if (workflowsToBackup.length === 0) {
            console.log(`❌ No ${environment} workflows found to backup`);
            // Return an empty backup object instead of null to allow the script to continue
            return {
                backupName,
                backupDir,
                metadata: {
                    backupName: backupName,
                    environment: environment,
                    createdAt: new Date().toISOString(),
                    workflowCount: 0,
                    failedCount: 0,
                    workflows: []
                }
            };
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

        // Clean up old backups to respect maxBackupsToKeep setting
        await this.cleanupOldBackups();

        return {
            backupName,
            backupDir,
            metadata
        };
    }

    async cleanupOldBackups(keepCount = this.config.settings.maxBackupsToKeep || 10) {
        const backupsDir = path.join('backups');

        if (!fs.existsSync(backupsDir)) {
            console.log('📁 No backups directory found');
            return;
        }

        const backupDirs = fs.readdirSync(backupsDir)
            .filter(item => {
                const itemPath = path.join(backupsDir, item);
                return fs.statSync(itemPath).isDirectory();
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

    async importLocalWorkflows(environment, specificWorkflows = null, version = null) {
        console.log(`🔄 Importing local workflows to ${environment}...`);

        if (version && environment === 'prod') {
            console.log(`📌 Using version ${version} for workflow variables`);
        }

        // Create backup before importing if enabled in settings
        if (this.config.settings.backupBeforeImport) {
            console.log(`💾 Creating backup before importing to ${environment}...`);
            await this.createBackup(environment, `pre_import_auto_${new Date().toISOString().replace(/[:.]/g, '').split('T')[0]}_${new Date().toTimeString().split(' ')[0].replace(/:/g, '')}`);
        }

        const exportDir = path.join('workflows');
        if (!fs.existsSync(exportDir)) {
            throw new Error(`Export directory not found: ${exportDir}`);
        }

        // Get all workflow files in the exported directory
        const workflowFiles = fs.readdirSync(exportDir)
            .filter(file => file.endsWith('.json') && !file.startsWith('_'));

        if (workflowFiles.length === 0) {
            throw new Error('No workflow files found in export directory');
        }

        console.log(`📋 Found ${workflowFiles.length} workflow files in export directory`);

        // Filter workflows if specific ones requested
        let filesToImport = workflowFiles;
        if (specificWorkflows && specificWorkflows.length > 0) {
            const specificFiles = specificWorkflows.map(baseName => {
                const workflowName = baseName + this.getSuffix(environment);
                return this.generateFileName(workflowName);
            });

            filesToImport = workflowFiles.filter(file => {
                return specificFiles.some(specificFile => file === specificFile);
            });

            console.log(`🎯 Filtering to ${filesToImport.length} specific workflows`);
        }

        if (filesToImport.length === 0) {
            console.log('❌ No matching workflow files found');
            return [];
        }

        // Get current workflows for comparison
        const currentWorkflows = await this.getAllWorkflows();
        const importResults = [];

        for (const workflowFile of filesToImport) {
            try {
                const result = await this.importSingleWorkflow(exportDir, workflowFile, currentWorkflows, environment, version);
                importResults.push(result);
            } catch (error) {
                console.error(`❌ Failed to import ${workflowFile}:`, error.message);
                importResults.push({
                    fileName: workflowFile,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        // Create import summary
        this.createImportSummary(importResults, environment);

        console.log(`✅ Import completed: ${importResults.filter(r => r.status === 'success').length} successful, ${importResults.filter(r => r.status === 'failed').length} failed`);

        return importResults;
    }

    async importSingleWorkflow(exportDir, workflowFile, currentWorkflows, environment, version = null) {
        const filePath = path.join(exportDir, workflowFile);
        const workflowData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Ensure the workflow has the correct environment suffix
        const baseName = this.getBaseNameFromWorkflowName(workflowData.name);
        const targetName = baseName + this.getSuffix(environment);

        // If the workflow name doesn't match the target environment, update it
        if (workflowData.name !== targetName) {
            console.log(`⚠️ Workflow name mismatch: ${workflowData.name} → ${targetName}`);
            workflowData.name = targetName;
        }

        // Inject environment variables if available
        this.injectEnvironmentVariables(workflowData, baseName, environment, version);

        // Clean node IDs to avoid conflicts
        this.cleanupNodeWebhookIds(workflowData);

        console.log(`🔄 Importing: ${targetName}`);

        // Find existing workflow with same name
        const existingWorkflow = currentWorkflows.find(w => w.name === targetName);

        // Clean workflow data for import
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
            // Update the existing workflow
            await this.client.put(`/api/v1/workflows/${existingWorkflow.id}`, cleanWorkflowData);
            result = {
                fileName: workflowFile,
                workflowName: targetName,
                action: 'updated',
                status: 'success',
                workflowId: existingWorkflow.id,
                previouslyActive: existingWorkflow.active
            };
            console.log(`  ✅ Updated: ${targetName} (was ${existingWorkflow.active ? 'active' : 'inactive'})`);
        } else {
            // Create a new workflow
            const createResponse = await this.client.post('/api/v1/workflows', cleanWorkflowData);
            result = {
                fileName: workflowFile,
                workflowName: targetName,
                action: 'created',
                status: 'success',
                workflowId: createResponse.data.id,
                previouslyActive: false
            };
            console.log(`  ✅ Created: ${targetName}`);
        }

        return result;
    }

    injectEnvironmentVariables(workflowData, baseName, environment, version = null) {
        // Find the workflow configuration in managed-workflows.json
        const workflowConfig = this.managedWorkflows.managedWorkflows.find(w => w.baseName === baseName);

        let envVariables = {};

        // Check if the workflow config exists and has variables for the specified environment
        if (!workflowConfig || !workflowConfig.variables || !workflowConfig.variables[environment]) {
            return;
        } else {
            // Clone the environment variables
            envVariables = { ...workflowConfig.variables[environment] };

            // Add a version if provided and we're in a prod environment
            if (version && environment === 'prod') {
                envVariables.version = version;
                console.log(`🔧 Injecting ${environment} variables with version ${version} for ${baseName}`);
            } else {
                console.log(`🔧 Injecting ${environment} variables for ${baseName}`);
            }
        }

        // Find the "Configuration" or "Variables" node in the workflow
        if (workflowData.nodes && Array.isArray(workflowData.nodes)) {
            let configNode = workflowData.nodes.find(node =>
                node.name === 'Configuration' || node.name === 'Variables'
            );

            // If no Configuration node exists, create one
            if (!configNode) {
                console.log(`📝 Creating new Configuration node for ${baseName}`);

                // Generate a unique ID for the new node
                const nodeId = `config-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

                // Create a new Code node
                configNode = {
                    parameters: {
                        jsCode: "return {};" // Default empty object
                    },
                    type: "n8n-nodes-base.code",
                    typeVersion: 2,
                    position: [
                        -720, // Position it at the start of the workflow
                        -80
                    ],
                    id: nodeId,
                    name: "Configuration"
                };

                // Add the node to the workflow
                workflowData.nodes.push(configNode);

                // If there's a trigger node, connect the Configuration node after it
                const triggerNode = workflowData.nodes.find(node =>
                    node.type.includes('Trigger') ||
                    node.name.includes('Trigger') ||
                    node.name.includes('When')
                );

                if (triggerNode && workflowData.connections) {
                    // Create connection from trigger to config node
                    if (!workflowData.connections[triggerNode.name]) {
                        workflowData.connections[triggerNode.name] = { main: [[]] };
                    }

                    workflowData.connections[triggerNode.name].main[0] = [
                        {
                            node: "Configuration",
                            type: "main",
                            index: 0
                        }
                    ];

                    // Create empty connection from config node
                    workflowData.connections["Configuration"] = { main: [[]] };
                }

                console.log(`✅ Created new Configuration node in ${baseName}`);
            }

            // Update the Configuration node with environment variables
            if (configNode.type === 'n8n-nodes-base.code') {
                // Create a JavaScript object string from the variables
                const variablesObj = JSON.stringify(envVariables, null, 2);
                configNode.parameters.jsCode = `return ${variablesObj};`;
                console.log(`✅ Updated ${configNode.name} node with ${environment} variables`);
            } else {
                // For non-Code nodes, replace it with a Code node
                console.log(`⚠️ ${configNode.name} node is not a Code node. Replacing with a Code node.`);

                // Save the position and connections of the existing node
                const position = configNode.position;
                const nodeId = configNode.id;
                const nodeName = configNode.name;

                // Replace the node with a Code node
                configNode.type = "n8n-nodes-base.code";
                configNode.typeVersion = 2;
                configNode.parameters = {
                    jsCode: `return ${JSON.stringify(envVariables, null, 2)};`
                };
                configNode.position = position;
                configNode.id = nodeId;
                configNode.name = nodeName;

                console.log(`✅ Replaced ${nodeName} with a Code node and updated with ${environment} variables`);
            }

            // Add or update Sticky Note with version information if a version is provided
            if (version) {
                this.addOrUpdateVersionStickyNote(workflowData, baseName, version, environment, configNode);
            }
        }
    }

    cleanupNodeWebhookIds(workflowData) {
        if (workflowData.nodes && Array.isArray(workflowData.nodes)) {
            for (const node of workflowData.nodes) {
                node.webhookId = undefined;
            }
        }
    }

    // Helper method to add or update version sticky note
    addOrUpdateVersionStickyNote(workflowData, baseName, version, environment) {
        // Look for the existing version sticky note
        let versionNote = workflowData.nodes.find(node =>
            node.type === 'n8n-nodes-base.stickyNote' &&
            (node.name === 'Version Info' || node.parameters?.content?.includes('Version'))
        );

        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const noteContent = `📦 **${baseName}**\n\n` +
            `**Version:** ${version}\n` +
            `**Environment:** ${environment}\n` +
            `**Deployed:** ${currentDate}\n\n` +
            `This workflow is managed by the release system.\n` +
            `Version is automatically injected during deployment.`;

        if (versionNote) {
            // Update existing sticky note
            console.log(`📝 Updating existing Version Info sticky note with version ${version}`);
            versionNote.parameters.content = noteContent;

            // Update color to indicate production deployment
            if (environment === 'prod') {
                versionNote.parameters.color = 4; // Green color for production
            }
        } else {
            // Create a new sticky note
            console.log(`📝 Creating new Version Info sticky note with version ${version}`);

            // Generate a unique ID for the sticky note
            const noteId = `sticky-version-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

            // Position the sticky note near the Configuration node
            let notePosition = [-900, -200];

            versionNote = {
                parameters: {
                    content: noteContent,
                    height: 260,
                    width: 280,
                    color: environment === 'prod' ? 4 : 5 // Green for prod, yellow for other
                },
                type: "n8n-nodes-base.stickyNote",
                typeVersion: 1,
                position: notePosition,
                id: noteId,
                name: "Version Info"
            };

            // Add the sticky note to the workflow
            workflowData.nodes.push(versionNote);
        }
    }

    createImportSummary(results, environment) {
        const summary = {
            importedAt: new Date().toISOString(),
            environment: environment,
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

        const summaryPath = path.join('logs', `_import_summary_${environment}.json`);
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`📊 Import summary saved: ${summaryPath}`);
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
