<?php

namespace ObliviousHarmony\VSCodePHPCSIntegration\Handlers;

use ObliviousHarmony\VSCodePHPCSIntegration\Extension\File;

/**
 * The interface for all PHPCS handlers.
 */
interface Handler
{
    /**
     * Executes a handler.
     *
     * @param  array      $report The PHPCS report we're processing.
     * @param  File       $file   The file we're reporting on.
     * @param  array|null $data   The data object passed from VS Code.
     * @return bool True if we have processed the file, otherwise false.
     */
    public function execute($report, File $file, $data);
}
