#!/usr/bin/env node

const readline = require('readline');
const WorkflowManager = require('./manage-workflows.js');

class InteractiveWorkflowSelector {
    constructor() {
        this.manager = new WorkflowManager();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async run() {
        console.log('🎯 Interactive Workflow Manager');
        console.log('================================');

        try {
            await this.showMainMenu();
        } catch (error) {
            console.error('❌ Error:', error.message);
        } finally {
            this.rl.close();
        }
    }

    async showMainMenu() {
        console.log('\nWhat would you like to do?');
        console.log('1. Export development workflows');
        console.log('2. Sync workflows to production');
        console.log('3. View workflow status');
        console.log('4. List managed workflows');
        console.log('5. Backup operations');
        console.log('6. Exit');

        const choice = await this.askQuestion('\nEnter your choice (1-6): ');

        switch (choice.trim()) {
            case '1':
                await this.handleExportWorkflows();
                break;
            case '2':
                await this.handleSyncWorkflows();
                break;
            case '3':
                await this.handleViewStatus();
                break;
            case '4':
                await this.handleListWorkflows();
                break;
            case '5':
                await this.handleBackupOperations();
                break;
            case '6':
                console.log('👋 Goodbye!');
                return;
            default:
                console.log('❌ Invalid choice. Please try again.');
                await this.showMainMenu();
        }
    }

    async handleExportWorkflows() {
        console.log('\n📤 Export Development Workflows');
        console.log('==============================');

        const workflows = await this.selectWorkflows('export');

        if (workflows.length === 0) {
            console.log('ℹ️ No workflows selected.');
            await this.showMainMenu();
            return;
        }

        console.log(`\n🔄 Exporting ${workflows.length} workflow(s)...`);

        try {
            await this.manager.exportManagedWorkflows('dev', workflows);
            console.log('✅ Export completed successfully!');
        } catch (error) {
            console.error('❌ Export failed:', error.message);
        }

        await this.showMainMenu();
    }

    async handleSyncWorkflows() {
        console.log('\n🔄 Sync Workflows to Production');
        console.log('===============================');

        console.log('⚠️  This will sync development workflows to production.');
        console.log('⚠️  Production workflows will be created/updated but remain INACTIVE.');

        const confirm = await this.askQuestion('\nDo you want to continue? (y/N): ');
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log('ℹ️ Sync cancelled.');
            await this.showMainMenu();
            return;
        }

        const workflows = await this.selectWorkflows('sync');

        if (workflows.length === 0) {
            console.log('ℹ️ No workflows selected.');
            await this.showMainMenu();
            return;
        }

        console.log(`\n🔄 Syncing ${workflows.length} workflow(s) to production...`);

        try {
            const results = await this.manager.syncDevToProd(workflows);
            console.log('✅ Sync completed successfully!');

            results.forEach(result => {
                if (result.status === 'success') {
                    console.log(`  ✅ ${result.baseName}: ${result.action}`);
                } else {
                    console.log(`  ❌ ${result.baseName}: ${result.error}`);
                }
            });

        } catch (error) {
            console.error('❌ Sync failed:', error.message);
        }

        await this.showMainMenu();
    }

    async handleViewStatus() {
        console.log('\n📊 Workflow Status');
        console.log('==================');

        await this.manager.getWorkflowStatus();
        await this.showMainMenu();
    }

    async handleListWorkflows() {
        console.log('\n📋 Managed Workflows');
        console.log('====================');

        console.log('Environment filter:');
        console.log('1. All environments');
        console.log('2. Development only');
        console.log('3. Production only');

        const choice = await this.askQuestion('\nEnter your choice (1-3): ');

        let environment = null;
        switch (choice.trim()) {
            case '2':
                environment = 'dev';
                break;
            case '3':
                environment = 'prod';
                break;
        }

        await this.manager.handleCommand('list', environment ? [environment] : []);
        await this.showMainMenu();
    }

    async handleBackupOperations() {
        console.log('\n💾 Backup Operations');
        console.log('====================');

        console.log('1. Create new backup');
        console.log('2. List available backups');
        console.log('3. Restore from backup');
        console.log('4. Cleanup old backups');
        console.log('5. Back to main menu');

        const choice = await this.askQuestion('\nEnter your choice (1-5): ');

        switch (choice.trim()) {
            case '1':
                await this.handleCreateBackup();
                break;
            case '2':
                await this.handleListBackups();
                break;
            case '3':
                await this.handleRestoreBackup();
                break;
            case '4':
                await this.handleCleanupBackups();
                break;
            case '5':
                await this.showMainMenu();
                return;
            default:
                console.log('❌ Invalid choice. Please try again.');
                await this.handleBackupOperations();
        }
    }

    async handleCreateBackup() {
        console.log('\n💾 Create Backup');
        console.log('================');

        console.log('Environment to backup:');
        console.log('1. Production (recommended)');
        console.log('2. Development');

        const envChoice = await this.askQuestion('\nEnter your choice (1-2): ');
        const environment = envChoice.trim() === '2' ? 'dev' : 'prod';

        const customName = await this.askQuestion('\nCustom backup name (optional, press Enter for auto): ');

        try {
            const result = await this.manager.createBackup(environment, customName.trim() || null);
            if (result) {
                console.log(`✅ Backup created successfully: ${result.backupName}`);
            }
        } catch (error) {
            console.error('❌ Backup failed:', error.message);
        }

        await this.handleBackupOperations();
    }

    async handleListBackups() {
        console.log('\n📦 Available Backups');
        console.log('====================');

        try {
            await this.manager.listBackups();
        } catch (error) {
            console.error('❌ Failed to list backups:', error.message);
        }

        await this.handleBackupOperations();
    }

    async handleRestoreBackup() {
        console.log('\n🔄 Restore from Backup');
        console.log('======================');

        // First, list available backups
        let backups;
        try {
            backups = await this.manager.listBackups();
        } catch (error) {
            console.error('❌ Failed to list backups:', error.message);
            await this.handleBackupOperations();
            return;
        }

        if (backups.length === 0) {
            console.log('❌ No backups available for restore');
            await this.handleBackupOperations();
            return;
        }

        // Let user select backup
        console.log('\nSelect backup to restore from:');
        backups.forEach((backup, index) => {
            const date = backup.created.toLocaleString();
            console.log(`${index + 1}. ${backup.name} (${date}) - ${backup.workflowCount} workflows`);
        });

        const backupChoice = await this.askQuestion(`\nEnter backup number (1-${backups.length}): `);
        const backupIndex = parseInt(backupChoice.trim()) - 1;

        if (backupIndex < 0 || backupIndex >= backups.length) {
            console.log('❌ Invalid backup selection');
            await this.handleRestoreBackup();
            return;
        }

        const selectedBackup = backups[backupIndex];

        // Ask for workflow selection
        console.log('\nWorkflow selection:');
        console.log('1. Restore all workflows from backup');
        console.log('2. Select specific workflows to restore');

        const selectionChoice = await this.askQuestion('\nEnter your choice (1-2): ');

        let workflowsToRestore = null;
        if (selectionChoice.trim() === '2') {
            workflowsToRestore = await this.selectWorkflows('restore');
            if (workflowsToRestore.length === 0) {
                console.log('ℹ️ No workflows selected for restore');
                await this.handleRestoreBackup();
                return;
            }
        }

        // Confirmation
        console.log('\n⚠️  RESTORE CONFIRMATION');
        console.log('========================');
        console.log(`Backup: ${selectedBackup.name}`);
        console.log(`Workflows: ${workflowsToRestore ? workflowsToRestore.join(', ') : 'All workflows in backup'}`);
        console.log('');
        console.log('⚠️  This will overwrite existing production workflows!');
        console.log('⚠️  Restored workflows will be imported as INACTIVE for safety.');

        const confirm = await this.askQuestion('\nAre you sure you want to proceed? (y/N): ');
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log('ℹ️ Restore cancelled.');
            await this.handleBackupOperations();
            return;
        }

        // Perform restore
        try {
            console.log('\n🔄 Restoring workflows...');
            const results = await this.manager.restoreFromBackup(selectedBackup.name, workflowsToRestore);

            const successful = results.filter(r => r.status === 'success').length;
            const failed = results.filter(r => r.status === 'failed').length;

            console.log(`\n✅ Restore completed: ${successful} successful, ${failed} failed`);

            if (successful > 0) {
                console.log('\n⚠️  Next Steps:');
                console.log('   1. Go to your n8n Cloud instance');
                console.log('   2. Review the restored workflows');
                console.log('   3. Manually activate workflows as needed');
            }

        } catch (error) {
            console.error('❌ Restore failed:', error.message);
        }

        await this.handleBackupOperations();
    }

    async handleCleanupBackups() {
        console.log('\n🧹 Cleanup Old Backups');
        console.log('======================');

        const keepCount = await this.askQuestion('\nNumber of backups to keep (default 10): ');
        const keep = keepCount.trim() ? parseInt(keepCount.trim()) : 10;

        if (isNaN(keep) || keep < 1) {
            console.log('❌ Invalid number. Using default of 10.');
            await this.manager.cleanupOldBackups(10);
        } else {
            await this.manager.cleanupOldBackups(keep);
        }

        await this.handleBackupOperations();
    }

    async selectWorkflows(action) {
        const configs = this.manager.managedWorkflows.managedWorkflows;

        console.log(`\nAvailable workflows for ${action}:`);
        console.log('0. All workflows');

        configs.forEach((config, index) => {
            console.log(`${index + 1}. ${config.baseName} - ${config.description}`);
        });

        const selection = await this.askQuestion('\nEnter workflow numbers (comma-separated) or 0 for all: ');

        if (selection.trim() === '0') {
            return configs.map(c => c.baseName);
        }

        const indices = selection.split(',')
            .map(s => parseInt(s.trim()) - 1)
            .filter(i => i >= 0 && i < configs.length);

        return indices.map(i => configs[i].baseName);
    }

    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }
}

// CLI usage
if (require.main === module) {
    const selector = new InteractiveWorkflowSelector();
    selector.run();
}
