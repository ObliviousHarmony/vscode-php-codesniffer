# VS Code PHP_CodeSniffer Integration Files

This package contains the PHP files required to integrate [PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer) into [the PHP_CodeSniffer VS Code extension](https://marketplace.visualstudio.com/items?itemName=obliviousharmony.vscode-php-codesniffer).

**Note: This package requires version 3.0 or newer of the VS Code extension.**

## Usage

The use of this package is _optional_ and is only required in cases where the `phpcs` command is not ran from the same environment as
VS Code. For example, when running PHP in a Docker container but not using one of VS Code's remote extensions. Simply install this package alongside PHPCS (globally or per-project) and the extension will automatically use it if it is available.
