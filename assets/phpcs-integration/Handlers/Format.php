<?php

namespace VSCode\PHP_CodeSniffer\Handlers;

use VSCode\PHP_CodeSniffer\Extension\File;

/**
 * A handler for formatting a document or range within a document.
 */
class Format implements Handler
{
    /**
     * Executes the actual PHPCS report.
     *
     * @param  array         $report The PHPCS report.
     * @param  File          $file   The file we're reporting on.
     * @param  stdClass|null $data   The data object passed from VS Code.
     * @return bool True if we have processed the file, otherwise false.
     */
    public function execute($report, File $file, $data)
    {
        // Apply the formatting restriction if one is given.
        $startToken = null;
        if (isset($data->start)) {
            // Find the token in the file using the VS Code position.
            $startToken = $file->getStackPtrForPosition($data->start->line, $data->start->character, true);
            if (!isset($startToken)) {
                return false;
            }
        }
        $endToken = null;
        if (isset($data->end)) {
            // Find the token in the file using the VS Code position.
            $endToken = $file->getStackPtrForPosition($data->end->line, $data->end->character, true);
            if (!isset($endToken)) {
                return false;
            }
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
