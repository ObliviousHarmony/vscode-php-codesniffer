<?php

namespace VSCode\PHP_CodeSniffer\Extension;

use PHP_CodeSniffer\Files\File as BaseFile;
use PHP_CodeSniffer\Sniffs\Sniff;

/**
 * A class that supports targeting specific tokens for fixes to allow for
 * tracking the edits that should be created by a single
 *
 * @property \VSCode\PHP_CodeSniffer\Extension\Fixer $fixer
 */
class File extends BaseFile
{
    /**
     * A map containing the token pointers indexed by [line][column].
     *
     * @var array
     */
    private $tokenPositionMap = array();

    /**
     * The token we're starting fixes on.
     *
     * @var int|null
     */
    private $formatStartToken = null;

    /**
     * The token we're ending fixes on.
     *
     * @var int|null
     */
    private $formatEndToken = null;

    /**
     * The token we're currently allowing fixes for.
     *
     * @var int|null
     */
    private $codeActionToken = null;

    /**
     * The message source we're currently allowing fixes for.
     *
     * @var string|null
     */
    private $codeActionSource = null;

    /**
     * Constructs an instance from an existing file.
     *
     * @param BaseFile $phpcsFile The file to use.
     */
    public function __construct(BaseFile $phpcsFile)
    {
        // Populate from the original file.
        $this->content = $phpcsFile->content;
        $this->tokens = $phpcsFile->tokens;
        $this->tokenizerType = $phpcsFile->tokenizerType;
        $this->tokenizer = $phpcsFile->tokenizer;
        $this->eolChar = $phpcsFile->eolChar;
        $this->numTokens = $phpcsFile->numTokens;
        $this->fixableCount = $phpcsFile->fixableCount;

        parent::__construct($phpcsFile->path, $phpcsFile->ruleset, $phpcsFile->config);

        $this->prepareTokensForVSCode();
    }

    /**
     * Parses the file and ensures that the tokens have been prepared for VS Code.
     *
     * @inheritDoc
     */
    public function parse()
    {
        parent::parse();
        $this->prepareTokensForVSCode();
    }

    /**
     * Gets the stack pointer for a position.
     *
     * @param  int  $line           The line to check.
     * @param  int  $column         The column to check.
     * @param  bool $useRangeFormat Indicates we should find the VS Code range format.
     * @return int|null
     */
    public function getStackPtrForPosition($line, $column, $useRangeFormat = false)
    {
        if ($useRangeFormat) {
            if (!isset($this->tokenPositionMap[$line . ':' . $column])) {
                return null;
            }

            return $this->tokenPositionMap[$line . ':' . $column];
        }

        if (!isset($this->tokenPositionMap[$line][$column])) {
            return null;
        }

        return $this->tokenPositionMap[$line][$column];
    }

    /**
     * Gets a specific token.
     *
     * @param  int $stackPtr The token pointer to fetch.
     * @return array
     */
    public function getToken($stackPtr)
    {
        return $this->tokens[$stackPtr];
    }

    /**
     * Formats a document range and returns the changed content as a result.
     *
     * @param  int|null $startToken The token to start formatting from.
     * @param  int|null $endToken   The token to end formatting on.
     * @return string
     */
    public function formatRange($startToken, $endToken)
    {
        $this->formatStartToken = $startToken;
        $this->formatEndToken = $endToken;

        // Fix the file.
        $this->fixer->enabled = true;
        $this->fixer->startFile($this);
        $this->fixer->fixFile();

        // Set us back so that the fixer will operate normally.
        $this->formatStartToken = null;
        $this->formatEndToken = null;

        // Make sure the caller knows when nothing has been formatted.
        if ($this->fixedCount <= 0) {
            return false;
        }

        return $this->fixer->getContents();
    }

    /**
     * Fixes a single code action and returns the content changed as a result.
     *
     * @param  int    $sourceStackPtr The position we want to fix.
     * @param  string $source         The problem we want to fix.
     * @return array
     */
    public function fixCodeAction($sourceStackPtr, $source)
    {
        $sniff = $this->getSniffFromMessageSource($source);
        if (!isset($sniff)) {
            return array();
        }

        if ($this->ignored === true) {
            return array();
        }

        // Replace the fixer with a custom one that can give us insight into
        // the specific tokens that have been replaced.
        $fixer = $this->fixer;
        $this->fixer = new Fixer();
        $this->fixer->enabled = true;
        $this->fixer->startFile($this);

        // Record the token that we're allowing to change so that we don't fix
        // any problem other than the one we're asking for.
        $this->codeActionToken = $sourceStackPtr;
        $this->codeActionSource = substr($source, strrpos($source, '.') + 1);

        // Make sure we're only processing allowed tokens.
        $allowedTokens = $sniff->register();

        // Apply the single sniff and get all of the tokens that were changed by it.
        for ($i = 0; $i < $this->numTokens; ++$i) {
            $token = $this->tokens[$i];
            if (!in_array($token['code'], $allowedTokens, true)) {
                continue;
            }

            $skip = $sniff->process($this, $i);
            // Make sure to support the skipping that sniffs do.
            if (isset($skip)) {
                $i = $skip;
            }
        }

        // We're going to use the tokens that were changed by the sniff to detect specific edits to make to the file.
        $changedTokens = $this->fixer->getTextEditTokens();

        // Set us back so that the fixer will operate normally.
        $this->fixer = $fixer;
        $this->codeActionToken = null;
        $this->codeActionSource = null;

        return $this->getTextEdits($changedTokens);
    }

    public function addFixableError($error, $stackPtr, $code, $data = array(), $severity = 0)
    {
        if (isset($this->codeActionToken)) {
            // We will assume that the error can be recorded because it wouldn't be in here otherwise.
            return $this->codeActionToken === $stackPtr && $this->codeActionSource === $code;
        }

        // Check the format range if one is set.
        if (isset($this->formatStartToken) && $stackPtr < $this->formatStartToken) {
            return false;
        }
        if (isset($this->formatEndToken) && $stackPtr > $this->formatEndToken) {
            return false;
        }

        return parent::addFixableError($error, $stackPtr, $code, $data, $severity);
    }

    public function addFixableWarning($warning, $stackPtr, $code, $data = array(), $severity = 0)
    {
        if (isset($this->codeActionToken)) {
            // We will assume that the error can be recorded because it wouldn't be in here otherwise.
            return $this->codeActionToken === $stackPtr && $this->codeActionSource === $code;
        }

        // Check the format range if one is set.
        if (isset($this->formatStartToken) && $stackPtr < $this->formatStartToken) {
            return false;
        }
        if (isset($this->formatEndToken) && $stackPtr > $this->formatEndToken) {
            return false;
        }

        return parent::addFixableWarning($warning, $stackPtr, $code, $data, $severity);
    }

    /**
     * Prepares the tokens for the VS Code file class functionality.
     */
    private function prepareTokensForVSCode()
    {
        $this->tokenPositionMap = array();

        // Review the tokens to populate some common data for us to work with.
        $columnOffset = -1;
        $lineWithOffset = -1;
        foreach ($this->tokens as $stackPtr => $token) {
            $line = $token['line'];
            $column = $token['column'];

            // Every new line should restart calculating the offsets.
            if ($lineWithOffset !== $line) {
                $lineWithOffset = $line;
                $columnOffset = 0;
            }

            // We should make a distinction between the orig_content and content
            // because PHPCS sometimes performs transformations internally
            // to make the data easier to work with.
            if (isset($token['orig_content'])) {
                $columnWidth = mb_strlen($token['orig_content']);
                $endsWithNewline = substr($token['orig_content'], -1);
            } else {
                $columnWidth = $token['length'];
                $endsWithNewline = substr($token['content'], -1);
            }
            $endsWithNewline = $endsWithNewline === "\n" || $endsWithNewline === "\r\n";

            $originalColumn = $column - $columnOffset;

            // Build a range object to represent this token in VS Code.
            if ($endsWithNewline) {
                // Newlines should wrap the range to the start of the next line.
                $range = array(
                    'startLine' => $line - 1,
                    'startCharacter' => $originalColumn - 1,
                    'endLine' => $line,
                    'endCharacter' => 0
                );
            } else {
                $range = array(
                    'startLine' => $line - 1,
                    'startCharacter' => $originalColumn - 1,
                    'endLine' => $line - 1,
                    'endCharacter' => $originalColumn + $columnWidth - 1
                );
            }

            // Store the range object to use elsewhere.
            $this->tokens[$stackPtr]['vscode_range'] = $range;

            // Make it easy to find the specific token associated with a position.
            $this->tokenPositionMap[$line][$column] = $stackPtr;
            // We will also store the range position for convenience.
            $this->tokenPositionMap[$range['startLine'] . ':' . $range['startCharacter']] = $stackPtr;

            // Our offset is the difference between the old and new lengths.
            $columnOffset += $token['length'] - $columnWidth;
        }
    }

    /**
     * Fetches the sniff class instance for the given message source.
     *
     * @param  string $source
     * @return Sniff|null
     */
    private function getSniffFromMessageSource($source)
    {
        // Transform the source into a sniff code so we can use it to get the sniff instance.
        $sniffCode = explode('.', $source, 4);
        $sniffCode = $sniffCode[0] . '.' . $sniffCode[1] . '.' . $sniffCode[2];
        if (!isset($this->ruleset->sniffCodes[$sniffCode])) {
            return null;
        }
        $sniffCode = $this->ruleset->sniffCodes[$sniffCode];

        return $this->ruleset->sniffs[$sniffCode];
    }

    /**
     * Takes an array of changed tokens and merged contiguous blocks into text edits.
     *
     * @param  array $changedTokens All of the tokens that changed.
     * @return array
     */
    private function getTextEdits($changedTokens)
    {
        $codeActionEdits = array();

        // Transform the changes into contiguous blocks to make the edits as small as possible.
        foreach ($changedTokens as $stackPtr => $newContent) {
            $token = $this->tokens[$stackPtr];
            $range = $token['vscode_range'];

            // Begin recording if we aren't already.
            if (!isset($replacementContent)) {
                $startLine = $range['startLine'];
                $startCharacter = $range['startCharacter'];
                $endLine = null;
                $endCharacter = null;
                $replacementContent = '';
            }

            // Keep moving the end until we reach the end of a block.
            $endLine = $range['endLine'];
            $endCharacter = $range['endCharacter'];

            // Record the content in the block.
            $replacementContent .= $newContent;

            // Contiguous token changes can be combined.
            if (isset($changedTokens[$stackPtr + 1])) {
                continue;
            }

            $codeActionEdits[] = array(
                'range' => array(
                    'startLine' => $startLine,
                    'startCharacter' => $startCharacter,
                    'endLine' => $endLine,
                    'endCharacter' => $endCharacter
                ),
                'newContent' => $replacementContent
            );
            // Clear the replacement after we've added it.
            $replacementContent = null;
        }

        return $codeActionEdits;
    }
}
