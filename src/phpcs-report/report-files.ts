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
    VSCodeFile: path.resolve(__dirname, '..', VSCodeFile),
    VSCodeFixer: path.resolve(__dirname, '..', VSCodeFixer),
    VSCodeReport: path.resolve(__dirname, '..', VSCodeReport),
}

export const ReportFiles = {
    Diagnostic: path.resolve(__dirname, '..', DiagnosticReport),
    CodeAction: path.resolve(__dirname, '..', CodeActionReport),
    Format: path.resolve(__dirname, '..', FormatReport),
};
