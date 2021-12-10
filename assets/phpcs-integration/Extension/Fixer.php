<?php

namespace VSCode\PHP_CodeSniffer\Extension;

use PHP_CodeSniffer\Fixer as BaseFixer;

/**
 * An extension of the fixer that we can use to track the changes that sniffs make to the file.
 */
class Fixer extends BaseFixer
{
    /**
     * Indicates whether or not the text edit is in a changeset.
     *
     * @var bool
     */
    private $textEditChangeset = false;

    /**
     * An array containing all of the tokens we're using in the text edit
     * that we're building.
     *
     * @var array
     */
    private $textEditTokens = array();

    public function replaceToken($stackPtr, $content)
    {
        $ret = parent::replaceToken($stackPtr, $content);
        if (!$ret) {
            return $ret;
        }

        if (!$this->textEditChangeset) {
            $this->textEditTokens[$stackPtr] = $stackPtr;
        }

        return $ret;
    }

    public function revertToken($stackPtr)
    {
        $ret = parent::revertToken($stackPtr);
        if (!$ret) {
            return $ret;
        }

        if (!$this->textEditChangeset) {
            unset($this->textEditTokens[$stackPtr]);
        }

        return $ret;
    }

    public function beginChangeset()
    {
        $ret = parent::beginChangeset();
        if (!isset($ret) || $ret) {
            $this->textEditChangeset = true;
        }

        return $ret;
    }

    public function endChangeset()
    {
        $this->textEditChangeset = false;
        return parent::endChangeset();
    }

    public function rollbackChangeset()
    {
        $this->textEditChangeset = false;
        return parent::rollbackChangeset();
    }

    /**
     * Fetches all of the tokens that have been modified.
     *
     * @return array
     */
    public function getTextEditTokens()
    {
        $tokens = array();
        foreach ($this->textEditTokens as $stackPtr) {
            $tokens[$stackPtr] = $this->getTokenContent($stackPtr);
        }

        // Sort the actions so that finding contiguous blocks is trivial.
        ksort($tokens);

        return $tokens;
    }
}
