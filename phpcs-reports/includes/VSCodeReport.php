<?php

namespace VSCode\PHP_CodeSniffer\Reports;

use PHP_CodeSniffer\Files\File;
use PHP_CodeSniffer\Reports\Report;
use VSCode\PHP_CodeSniffer\VSCodeFile;

// @phpcs:disable
require_once __DIR__ . DIRECTORY_SEPARATOR . 'VSCodeFile.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'VSCodeFixer.php';
// @phpcs:enable

/**
 * A base class for custom reports that handle PHPCS data in a way that
 * the extension can more easily consume.
 */
abstract class VSCodeReport implements Report
{
    /**
     * Generates a diagnostic report for a processed file.
     *
     * @param array $report The prepared report data.
     * @param File $phpcsFile The file being reported on.
     * @param bool $showSources Whether or not we should show sources in the report.
     * @param int $width The maximum allowed line width for the report.
     *
     * @return true
     */
    public function generateFileReport($report, File $phpcsFile, $showSources = false, $width = 80)
    {
        // Convert the file into our custom class so that we can extend PHPCS.
        $phpcsFile = new VSCodeFile($phpcsFile);

        // We use an environment variable to pass data to the reports.
        $data = $this->getVSCodeData();

        // Execute the report now that we've prepared everything.
        return $this->executeReport($report, $phpcsFile, $data);
    }

    /**
     * Generates the final report.
     *
     * @param string $cachedData The result from running generateFileReport on each file in the request.
     * @param int $totalFiles Total nunber of files checked.
     * @param int $totalErrors Total number of errors.
     * @param int $totalWarnings Total number of warnings.
     * @param int $totalFixable Total number of fixable problems.
     * @param bool $showSources Whether or not we should show sources in the report.
     * @param int $width The maximum allowed line width for the report.
     * @param bool $interactive Indicates whether or not the report is being generated interactively.
     * @param bool $toScreen Indicates whether or not the report is being printed to the screen.
     */
    public function generate(
        $cachedData,
        $totalFiles,
        $totalErrors,
        $totalWarnings,
        $totalFixable,
        $showSources = false,
        $width = 80,
        $interactive = false,
        $toScreen = true
    ) {
        // Remove the trailing comma that every file adds to the end of their report.
        echo '{"files":[';
        echo rtrim($cachedData, ",");
        echo ']}' . PHP_EOL;
    }

    /**
     * Reads data from the VS Code environment variable.
     *
     * @return array|null
     * @throws \InvalidArgumentException When the environemnt variable is invalid.
     */
    protected function getVSCodeData()
    {
        if (empty($_SERVER['PHPCS_VSCODE_DATA'])) {
            return null;
        }
        $data = json_decode($_SERVER['PHPCS_VSCODE_DATA']);
        if (empty($data)) {
            throw new \InvalidArgumentException('The "PHPCS_VSCODE_DATA" environment variable is invalid.');
        }

        return $data;
    }

    /**
     * Executes the actual PHPCS report.
     *
     * @param array $report The PHPCS report we're processing.
     * @param VSCodeFile $file The file we're reporting on.
     * @param array|null $data The data object passed from VS Code.
     * @return bool True if we have processed the file, otherwise false.
     */
    abstract protected function executeReport($report, VSCodeFile $file, $data);
}
