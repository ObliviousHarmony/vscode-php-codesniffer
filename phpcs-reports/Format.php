<?php

namespace VSCode\PHP_CodeSniffer\Reports;

use VSCode\PHP_CodeSniffer\VSCodeFile;

require_once __DIR__ . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'VSCodeReport.php';

/**
 * A custom report for formatting a document or range within a document.
 */
class Format extends VSCodeReport
{
    /**
     * Executes the actual PHPCS report.
     *
     * @param array $report The PHPCS report.
     * @param VSCodeFile $file The file we're reporting on.
     * @param stdClass|null $data The data object passed from VS Code.
     * @return bool True if we have processed the file, otherwise false.
     */
    protected function executeReport($report, VSCodeFile $file, $data)
    {
        // Apply the formatting restriction if one is given.
        $startToken = null;
        if (isset($data->start)) {
            $startToken = $file->getStackPtrForPosition($data->start->line, $data->start->character, true);
        }
        $endToken = null;
        if (isset($data->end)) {
            $endToken = $file->getStackPtrForPosition($data->end->line, $data->end->character, true);
        }

        // Format the given range.
        $newContent = $file->formatRange($startToken, $endToken);

        echo json_encode(
            array(
                'filename' => $report['filename'],
                'content' => $newContent
            ),
            JSON_UNESCAPED_LINE_TERMINATORS
        );
        // Ensure multiple files are separated by a comma.
        echo ',';

        return true;
    }
}
