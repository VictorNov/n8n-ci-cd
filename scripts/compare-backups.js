#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class BackupComparator {
    constructor() {
        this.differences = [];
    }

    compareBackups(backup1Name, backup2Name) {
        console.log(`🔍 Comparing backups:`);
        console.log(`   📦 ${backup1Name}`);
        console.log(`   📦 ${backup2Name}`);
        console.log('');

        const backup1Path = path.join('workflows', 'backups', backup1Name);
        const backup2Path = path.join('workflows', 'backups', backup2Name);

        // Verify both backups exist
        if (!fs.existsSync(backup1Path)) {
            console.error(`❌ Backup not found: ${backup1Name}`);
            return false;
        }

        if (!fs.existsSync(backup2Path)) {
            console.error(`❌ Backup not found: ${backup2Name}`);
            return false;
        }

        // Get workflow files from both backups
        const backup1Files = this.getWorkflowFiles(backup1Path);
        const backup2Files = this.getWorkflowFiles(backup2Path);

        // Compare file lists
        this.compareFileLists(backup1Files, backup2Files, backup1Name, backup2Name);

        // Compare individual workflows
        this.compareWorkflowContents(backup1Path, backup2Path, backup1Files, backup2Files);

        this.reportDifferences(backup1Name, backup2Name);

        return this.differences.length === 0;
    }

    getWorkflowFiles(backupPath) {
        return fs.readdirSync(backupPath)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'))
            .sort();
    }

    compareFileLists(files1, files2, backup1Name, backup2Name) {
        const set1 = new Set(files1);
        const set2 = new Set(files2);

        // Files only in backup1
        const onlyIn1 = files1.filter(f => !set2.has(f));
        if (onlyIn1.length > 0) {
            this.differences.push({
                type: 'file_missing',
                description: `Files only in ${backup1Name}`,
                details: onlyIn1
            });
        }

        // Files only in backup2
        const onlyIn2 = files2.filter(f => !set1.has(f));
        if (onlyIn2.length > 0) {
            this.differences.push({
                type: 'file_extra',
                description: `Files only in ${backup2Name}`,
                details: onlyIn2
            });
        }

        console.log(`📊 File comparison:`);
        console.log(`   ${backup1Name}: ${files1.length} files`);
        console.log(`   ${backup2Name}: ${files2.length} files`);
        console.log(`   Common files: ${files1.filter(f => set2.has(f)).length}`);
        console.log('');
    }

    compareWorkflowContents(backup1Path, backup2Path, files1, files2) {
        // Compare common files
        const commonFiles = files1.filter(f => files2.includes(f));

        console.log(`🔍 Comparing ${commonFiles.length} common workflows...`);

        for (const file of commonFiles) {
            this.compareWorkflowFile(
                path.join(backup1Path, file),
                path.join(backup2Path, file),
                file
            );
        }
    }

    compareWorkflowFile(file1Path, file2Path, fileName) {
        try {
            const workflow1 = JSON.parse(fs.readFileSync(file1Path, 'utf8'));
            const workflow2 = JSON.parse(fs.readFileSync(file2Path, 'utf8'));

            // Compare basic properties
            if (workflow1.name !== workflow2.name) {
                this.differences.push({
                    type: 'workflow_name_changed',
                    file: fileName,
                    description: `Workflow name changed`,
                    details: { from: workflow1.name, to: workflow2.name }
                });
            }

            if (workflow1.active !== workflow2.active) {
                this.differences.push({
                    type: 'workflow_status_changed',
                    file: fileName,
                    description: `Workflow active status changed`,
                    details: { from: workflow1.active, to: workflow2.active }
                });
            }

            // Compare node count
            const nodes1Count = workflow1.nodes ? workflow1.nodes.length : 0;
            const nodes2Count = workflow2.nodes ? workflow2.nodes.length : 0;

            if (nodes1Count !== nodes2Count) {
                this.differences.push({
                    type: 'node_count_changed',
                    file: fileName,
                    description: `Node count changed`,
                    details: { from: nodes1Count, to: nodes2Count }
                });
            }

            // Compare node types (simplified comparison)
            if (workflow1.nodes && workflow2.nodes) {
                const types1 = workflow1.nodes.map(n => n.type).sort();
                const types2 = workflow2.nodes.map(n => n.type).sort();

                if (JSON.stringify(types1) !== JSON.stringify(types2)) {
                    this.differences.push({
                        type: 'node_types_changed',
                        file: fileName,
                        description: `Node types changed`,
                        details: {
                            added: types2.filter(t => !types1.includes(t)),
                            removed: types1.filter(t => !types2.includes(t))
                        }
                    });
                }
            }

            // Compare workflow tags
            const tags1 = (workflow1.tags || []).map(t => t.name || t).sort();
            const tags2 = (workflow2.tags || []).map(t => t.name || t).sort();

            if (JSON.stringify(tags1) !== JSON.stringify(tags2)) {
                this.differences.push({
                    type: 'tags_changed',
                    file: fileName,
                    description: `Workflow tags changed`,
                    details: {
                        from: tags1,
                        to: tags2
                    }
                });
            }

            // Compare connections (basic check)
            const connections1Keys = Object.keys(workflow1.connections || {}).sort();
            const connections2Keys = Object.keys(workflow2.connections || {}).sort();

            if (JSON.stringify(connections1Keys) !== JSON.stringify(connections2Keys)) {
                this.differences.push({
                    type: 'connections_changed',
                    file: fileName,
                    description: `Workflow connections changed`,
                    details: {
                        from: connections1Keys.length + ' connection sources',
                        to: connections2Keys.length + ' connection sources'
                    }
                });
            }

        } catch (error) {
            this.differences.push({
                type: 'comparison_error',
                file: fileName,
                description: `Failed to compare workflow`,
                details: error.message
            });
        }
    }

    reportDifferences(backup1Name, backup2Name) {
        console.log(`\n📊 Comparison Results:`);
        console.log('='.repeat(50));

        if (this.differences.length === 0) {
            console.log('✅ Backups are identical - no differences found!');
            return;
        }

        console.log(`Found ${this.differences.length} difference(s):\n`);

        // Group differences by file
        const fileGroups = {};
        for (const diff of this.differences) {
            const key = diff.file || 'General';
            if (!fileGroups[key]) {
                fileGroups[key] = [];
            }
            fileGroups[key].push(diff);
        }

        for (const [fileName, diffs] of Object.entries(fileGroups)) {
            if (fileName !== 'General') {
                console.log(`📄 ${fileName}:`);
            }

            for (const diff of diffs) {
                const icon = this.getIconForDifferenceType(diff.type);
                console.log(`   ${icon} ${diff.description}`);

                if (diff.details) {
                    if (Array.isArray(diff.details)) {
                        console.log(`      Items: ${diff.details.join(', ')}`);
                    } else if (typeof diff.details === 'object') {
                        if (diff.details.from !== undefined && diff.details.to !== undefined) {
                            console.log(`      From: ${JSON.stringify(diff.details.from)}`);
                            console.log(`      To: ${JSON.stringify(diff.details.to)}`);
                        } else {
                            console.log(`      Details: ${JSON.stringify(diff.details, null, 6)}`);
                        }
                    } else {
                        console.log(`      Details: ${diff.details}`);
                    }
                }
            }
            console.log('');
        }

        // Summary
        const changeTypes = [...new Set(this.differences.map(d => d.type))];
        console.log(`📋 Change types found: ${changeTypes.join(', ')}`);
    }

    getIconForDifferenceType(type) {
        const icons = {
            'file_missing': '📭',
            'file_extra': '📬',
            'workflow_name_changed': '📝',
            'workflow_status_changed': '🔄',
            'node_count_changed': '🔢',
            'node_types_changed': '🔧',
            'tags_changed': '🏷️',
            'connections_changed': '🔗',
            'comparison_error': '❌'
        };
        return icons[type] || '📋';
    }

    generateDiffReport(backup1Name, backup2Name, outputPath = null) {
        const reportPath = outputPath || `backup-comparison-${Date.now()}.json`;

        const report = {
            comparedAt: new Date().toISOString(),
            backup1: backup1Name,
            backup2: backup2Name,
            totalDifferences: this.differences.length,
            changeTypes: [...new Set(this.differences.map(d => d.type))],
            differences: this.differences
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`📄 Detailed comparison report saved: ${reportPath}`);

        return report;
    }
}

// CLI usage
if (require.main === module) {
    const [,, backup1, backup2, ...args] = process.argv;

    if (!backup1 || !backup2) {
        console.log('Usage: node compare-backups.js <backup1-name> <backup2-name> [--report output.json]');
        console.log('');
        console.log('Example:');
        console.log('  node compare-backups.js backup_prod_20241201_120000 backup_prod_20241201_143000');
        console.log('  node compare-backups.js backup1 backup2 --report comparison-report.json');
        console.log('');
        console.log('Available backups:');

        const backupsDir = path.join('workflows', 'backups');
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

    const comparator = new BackupComparator();
    const identical = comparator.compareBackups(backup1, backup2);

    // Check for --report flag
    const reportIndex = args.indexOf('--report');
    if (reportIndex !== -1 && args[reportIndex + 1]) {
        comparator.generateDiffReport(backup1, backup2, args[reportIndex + 1]);
    }

    // Exit with appropriate code
    process.exit(identical ? 0 : 1);
}

module.exports = BackupComparator;
