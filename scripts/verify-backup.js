#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class BackupVerifier {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    verifyBackup(backupName) {
        console.log(`🔍 Verifying backup: ${backupName}`);

        const backupPath = path.join('backups', backupName);

        if (!fs.existsSync(backupPath)) {
            this.errors.push(`Backup directory not found: ${backupPath}`);
            return false;
        }

        // Check metadata file
        this.verifyMetadata(backupPath, backupName);

        // Check workflow files
        this.verifyWorkflowFiles(backupPath, backupName);

        // Check backup integrity
        this.verifyBackupIntegrity(backupPath, backupName);

        this.reportResults(backupName);

        return this.errors.length === 0;
    }

    verifyMetadata(backupPath, backupName) {
        const metadataPath = path.join(backupPath, '_backup_metadata.json');

        if (!fs.existsSync(metadataPath)) {
            this.errors.push('Backup metadata file missing');
            return;
        }

        try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

            // Verify required metadata fields
            const required = ['backupName', 'environment', 'createdAt', 'workflowCount'];
            for (const field of required) {
                if (!metadata[field]) {
                    this.errors.push(`Missing metadata field: ${field}`);
                }
            }

            // Verify backup name matches
            if (metadata.backupName !== backupName) {
                this.warnings.push(`Backup name mismatch: expected ${backupName}, got ${metadata.backupName}`);
            }

            console.log(`📊 Metadata: ${metadata.workflowCount} workflows, created ${metadata.createdAt}`);

        } catch (error) {
            this.errors.push(`Invalid metadata JSON: ${error.message}`);
        }
    }

    verifyWorkflowFiles(backupPath, backupName) {
        const files = fs.readdirSync(backupPath)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));

        if (files.length === 0) {
            this.errors.push('No workflow files found in backup');
            return;
        }

        console.log(`📁 Found ${files.length} workflow files`);

        for (const file of files) {
            this.verifyWorkflowFile(path.join(backupPath, file), file);
        }
    }

    verifyWorkflowFile(filePath, fileName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const workflow = JSON.parse(content);

            // Check required workflow fields
            const required = ['name', 'nodes', 'connections'];
            for (const field of required) {
                if (!workflow[field]) {
                    this.errors.push(`${fileName}: Missing required field: ${field}`);
                }
            }

            // Check workflow has proper suffix
            if (workflow.name && !workflow.name.includes('-')) {
                this.warnings.push(`${fileName}: Workflow name may not follow suffix convention: ${workflow.name}`);
            }

            // Check nodes array
            if (Array.isArray(workflow.nodes) && workflow.nodes.length === 0) {
                this.warnings.push(`${fileName}: Workflow has no nodes`);
            }

            // Check for essential node properties
            if (Array.isArray(workflow.nodes)) {
                for (let i = 0; i < workflow.nodes.length; i++) {
                    const node = workflow.nodes[i];
                    if (!node.name || !node.type) {
                        this.errors.push(`${fileName}: Node ${i} missing name or type`);
                    }
                }
            }

            // Check connections structure
            if (workflow.connections && typeof workflow.connections !== 'object') {
                this.errors.push(`${fileName}: Invalid connections structure`);
            }

        } catch (error) {
            this.errors.push(`${fileName}: Invalid JSON - ${error.message}`);
        }
    }

    verifyBackupIntegrity(backupPath, backupName) {
        // Check if backup was created recently (within reasonable time)
        const stats = fs.statSync(backupPath);
        const ageInHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageInHours > 24 * 7) { // Older than 1 week
            this.warnings.push(`Backup is ${Math.round(ageInHours / 24)} days old`);
        }

        // Check backup size (should have some reasonable size)
        const calculateSize = (dirPath) => {
            let totalSize = 0;
            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            }

            return totalSize;
        };

        const backupSize = calculateSize(backupPath);
        if (backupSize < 1000) { // Less than 1KB seems too small
            this.warnings.push(`Backup size seems unusually small: ${backupSize} bytes`);
        }

        console.log(`📏 Backup size: ${(backupSize / 1024).toFixed(2)} KB`);

        // Check for duplicate workflow names
        const files = fs.readdirSync(backupPath)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'));

        const workflowNames = [];
        for (const file of files) {
            try {
                const workflow = JSON.parse(fs.readFileSync(path.join(backupPath, file), 'utf8'));
                if (workflow.name) {
                    if (workflowNames.includes(workflow.name)) {
                        this.errors.push(`Duplicate workflow name found: ${workflow.name}`);
                    }
                    workflowNames.push(workflow.name);
                }
            } catch (error) {
                // Already handled in verifyWorkflowFile
            }
        }

        // Cross-reference metadata with actual files
        const metadataPath = path.join(backupPath, '_backup_metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                if (metadata.workflowCount !== files.length) {
                    this.warnings.push(`Metadata workflow count (${metadata.workflowCount}) doesn't match actual files (${files.length})`);
                }
            } catch (error) {
                // Already handled in verifyMetadata
            }
        }
    }

    reportResults(backupName) {
        console.log(`\n📊 Backup Verification Results for: ${backupName}`);
        console.log('='.repeat(50));

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ Backup verification passed - no issues found!');
            return;
        }

        if (this.errors.length > 0) {
            console.log(`\n❌ ${this.errors.length} Error(s):`);
            for (const error of this.errors) {
                console.log(`   ${error}`);
            }
        }

        if (this.warnings.length > 0) {
            console.log(`\n⚠️  ${this.warnings.length} Warning(s):`);
            for (const warning of this.warnings) {
                console.log(`   ${warning}`);
            }
        }

        console.log(`\n🏁 Overall status: ${this.errors.length === 0 ? '✅ PASS' : '❌ FAIL'}`);
    }

    verifyAllBackups() {
        const backupsDir = path.join('backups');

        if (!fs.existsSync(backupsDir)) {
            console.log('📁 No backups directory found');
            return;
        }

        const backupDirs = fs.readdirSync(backupsDir)
            .filter(item => {
                const itemPath = path.join(backupsDir, item);
                return fs.statSync(itemPath).isDirectory();
            });

        if (backupDirs.length === 0) {
            console.log('📁 No backups found');
            return;
        }

        console.log(`🔍 Verifying ${backupDirs.length} backups...\n`);

        let passCount = 0;
        let failCount = 0;

        for (const backupDir of backupDirs) {
            // Reset errors/warnings for each backup
            this.errors = [];
            this.warnings = [];

            const passed = this.verifyBackup(backupDir);
            if (passed) {
                passCount++;
            } else {
                failCount++;
            }

            console.log(''); // Empty line between backups
        }

        console.log(`\n🏁 Final Results: ${passCount} passed, ${failCount} failed`);

        // Return summary
        return {
            total: backupDirs.length,
            passed: passCount,
            failed: failCount
        };
    }

    generateVerificationReport(backupName = null) {
        const timestamp = new Date().toISOString();

        if (backupName) {
            // Single backup report
            const report = {
                verifiedAt: timestamp,
                backupName: backupName,
                errors: this.errors,
                warnings: this.warnings,
                passed: this.errors.length === 0
            };

            const reportPath = `backup-verification-${backupName}-${Date.now()}.json`;
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Verification report saved: ${reportPath}`);

            return report;
        } else {
            // All backups report
            const summary = this.verifyAllBackups();
            const reportPath = `backup-verification-all-${Date.now()}.json`;

            const report = {
                verifiedAt: timestamp,
                summary: summary,
                note: 'Detailed results logged to console'
            };

            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Summary report saved: ${reportPath}`);

            return report;
        }
    }
}

// CLI usage
if (require.main === module) {
    const [,, backupName, ...args] = process.argv;

    const verifier = new BackupVerifier();

    if (backupName) {
        if (backupName === '--all') {
            const summary = verifier.verifyAllBackups();
            process.exit(summary.failed > 0 ? 1 : 0);
        } else {
            const passed = verifier.verifyBackup(backupName);

            // Check for --report flag
            if (args.includes('--report')) {
                verifier.generateVerificationReport(backupName);
            }

            process.exit(passed ? 0 : 1);
        }
    } else {
        console.log('Usage: node verify-backup.js [backup-name|--all] [--report]');
        console.log('');
        console.log('Examples:');
        console.log('  node verify-backup.js backup_prod_20241201_143000');
        console.log('  node verify-backup.js backup_prod_20241201_143000 --report');
        console.log('  node verify-backup.js --all');
        console.log('  node verify-backup.js --all --report');
        console.log('');
        console.log('Available backups:');

        const backupsDir = path.join('backups');
        if (fs.existsSync(backupsDir)) {
            const backups = fs.readdirSync(backupsDir)
                .filter(item => fs.statSync(path.join(backupsDir, item)).isDirectory())
                .sort()
                .reverse(); // Show newest first

            if (backups.length > 0) {
                backups.slice(0, 10).forEach(backup => console.log(`  - ${backup}`));
                if (backups.length > 10) {
                    console.log(`  ... and ${backups.length - 10} more`);
                }
            } else {
                console.log('  No backups found');
            }
        } else {
            console.log('  No backups directory found');
        }

        process.exit(1);
    }
}

module.exports = BackupVerifier;
