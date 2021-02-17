/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

// Dependencies
const VSCodeFile = require('../../phpcs-reports/includes/VSCodeFile.php');
const VSCodeFixer = require('../../phpcs-reports/includes/VSCodeFixer.php');
const VSCodeReport = require('../../phpcs-reports/includes/VSCodeReport.php');

// Report Files
const DiagnosticReport = require('../../phpcs-reports/Diagnostic.php');
const CodeActionReport = require('../../phpcs-reports/CodeAction.php');
const FormatReport = require('../../phpcs-reports/Format.php');

export const Dependencies = {
    VSCodeFile: path.resolve(__dirname, '..', 'dist', VSCodeFile),
    VSCodeFixer: path.resolve(__dirname, '..', 'dist', VSCodeFixer),
    VSCodeReport: path.resolve(__dirname, '..', 'dist', VSCodeReport),
}

export const ReportFiles = {
    Diagnostic: path.resolve(__dirname, '..', 'dist', DiagnosticReport),
    CodeAction: path.resolve(__dirname, '..', 'dist', CodeActionReport),
    Format: path.resolve(__dirname, '..', 'dist', FormatReport),
};
