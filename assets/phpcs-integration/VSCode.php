<?php

namespace VSCode\PHP_CodeSniffer;

use PHP_CodeSniffer\Files\File as BaseFile;
use PHP_CodeSniffer\Reports\Report;
use VSCode\PHP_CodeSniffer\Extension\File;
use VSCode\PHP_CodeSniffer\Handlers\Handler;

/**
 * The custom report for our PHPCS integration.
 */
class VSCode implements Report
{
    /**
     * Constructor.
     */
    public function __construct()
    {
        // Dependencies must be loaded during class construction, as otherwise,
        // we can't guarantee that PHPCS won't execute the wrong class file.
        include_once __DIR__ . '/Extension/File.php';
        include_once __DIR__ . '/Extension/Fixer.php';
        include_once __DIR__ . '/Handlers/Handler.php';
        include_once __DIR__ . '/Handlers/Diagnostic.php';
        include_once __DIR__ . '/Handlers/CodeAction.php';
        include_once __DIR__ . '/Handlers/Format.php';
    }

    /**
     * Generates a diagnostic report for a processed file.
     *
     * @param array    $report      The prepared report data.
     * @param BaseFile $phpcsFile   The file being reported on.
     * @param bool     $showSources Whether or not we should show sources in the report.
     * @param int      $width       The maximum allowed line width for the report.
     *
     * @return true
     */
    public function generateFileReport($report, BaseFile $phpcsFile, $showSources = false, $width = 80)
    {
        // Convert the file into our custom class so that we can extend PHPCS.
        $phpcsFile = new File($phpcsFile);

        // We use an environment variable to pass input to the reports.
        $input = $this->getVSCodeInput();

        // Use the handler to process the report.
        $handler = $this->getHandler($input->type);
        return $handler->execute($report, $phpcsFile, $input->data);
    }

    /**
     * Generates the final report.
     *
     * @param string $cachedData    The result from running generateFileReport on each file in the request.
     * @param int    $totalFiles    Total nunber of files checked.
     * @param int    $totalErrors   Total number of errors.
     * @param int    $totalWarnings Total number of warnings.
     * @param int    $totalFixable  Total number of fixable problems.
     * @param bool   $showSources   Whether or not we should show sources in the report.
     * @param int    $width         The maximum allowed line width for the report.
     * @param bool   $interactive   Indicates whether or not the report is being generated interactively.
     * @param bool   $toScreen      Indicates whether or not the report is being printed to the screen.
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
     * Gets the handler class for this report.
     *
     * @param  string $reportType The type of the report we are running.
     * @return Handler
     * @throws \InvalidArgumentException The handler could not be found.
     */
    protected function getHandler($reportType)
    {
        // Find the handler class file that should power this report.
        $report = '\\VSCode\\PHP_CodeSniffer\\Handlers\\' . $reportType;
        if (!\class_exists($report)) {
            throw new \InvalidArgumentException('Handler "' . $report . '" could be found');
        }

        return new $report();
    }

    /**
     * Reads data from the VS Code environment variable.
     *
     * @return \stdClass|null
     * @throws \InvalidArgumentException The environemnt variable is invalid.
     */
    protected function getVSCodeInput()
    {
        if (empty($_SERVER['PHPCS_VSCODE_INPUT'])) {
            return null;
        }
        $data = json_decode($_SERVER['PHPCS_VSCODE_INPUT']);
        if (empty($data)) {
            throw new \InvalidArgumentException('The "PHPCS_VSCODE_INPUT" environment variable is invalid.');
        }

        return $data;
    }
}
