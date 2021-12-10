<?php

namespace VSCode\PHP_CodeSniffer\Handlers;

use VSCode\PHP_CodeSniffer\Extension\File;

/**
 * A handler for returning information about edits from PHPCS in a way
 * that the extension can easily consume.
 */
class CodeAction implements Handler
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
        // Get information about the problem we want to fix.
        $problemSource = $data->code;

        // Find the token in the file using the VS Code position.
        $stackPtr = $file->getStackPtrForPosition($data->line, $data->character, true);
        if (!isset($stackPtr)) {
            return false;
        }

        // Find the token that we're trying to fix.
        $token = $file->getToken($stackPtr);

        // Find the problem message we're trying to fix.
        if (!isset($report['messages'][$token['line']][$token['column']])) {
            return false;
        }
        $messages = $report['messages'][$token['line']][$token['column']];
        foreach ($messages as $message) {
            // Only operate on the specific problem we're looking for.
            if ($message['source'] !== $problemSource) {
                continue;
            }

            // If it isn't fixable then we don't need to worry about it.
            if (!$message['fixable']) {
                continue;
            }

            // Fix the specific action and render the edits.
            $edits = $file->fixCodeAction($stackPtr, $problemSource);

            echo json_encode(
                array(
                    'filename' => $report['filename'],
                    'textEdits' => $edits
                ),
                JSON_UNESCAPED_LINE_TERMINATORS
            );
            // Ensure multiple files are separated by a comma.
            echo ',';

            return true;
        }

        return false;
    }
}
