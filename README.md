# VS Code PHP_CodeSniffer Extension

Integrates [PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer) into VS Code.

This extension uses the version of PHPCS defined by the platform-specific executable setting. Through the use of
custom reports we are able to generate diagnostics, code actions, and document formatting that fully utilizes
VS Code's available features.

## Configuration

_**Until you configure it, this extension will not lint any files.**_

### Standard (`phpCodeSniffer.standard`)

This dropdown selects the coding standard that will be used. There are a few options that, when selected, will instead change the behavior of the extension.

#### `Disabled`

This option will prevent the extension from linting any documents.

#### `Default`

Allow PHPCS to decide what standard should apply to the document. It will either use the default standard if one is configured, otherwise, it will try to find one in the workspace root and all parent directories.

#### `Automatic`

When selected, this option will cause the extension to search for an applicable coding standard file (`.phpcs.xml`, `phpcs.xml`, `.phpcs.xml.dist`, `phpcs.xml.dist`). The extension starts in the document's folder and traverses through parent directories until it reaches the workspace root. If the extension fails to find a file it will do nothing and output an error.

#### `Custom`

This option will use the content of the `phpCodeSniffer.standardCustom` input as the standard. This can be the name of a custom ruleset, or, a path to a custom standard file. If a relative path is given it will be based
on the workspace root that the document resides in (untitled documents use the first root).

### Executable (`phpCodeSniffer.exec.linux`, `phpCodeSniffer.exec.osx`, and `phpCodeSniffer.exec.windows`)

This text input allows for setting a path to a platform-specific PHPCS executable. If a relative path is given it will be
based on the workspace root that the document resides in (untitled documents use the first root). Any arguments or options
added after the executable will be passed to it automatically.

You may also set the
`phpCodeSniffer.autoExecutable` option if you'd like for the extension to automatically search for an executable. This
works by looking for a `{vendor-dir}/bin/phpcs` (`{vendor-dir}\bin\phpcs.bat` on Windows) file in the document's directory and then
traversing up to the workspace folder if it does not find one. When it fails to find one automatically it will
fall back to the explicit option.

### File and Folder Exclusions (`phpCodeSniffer.exclude`)

This array of glob patterns allows you to exclude files and folders from linting. While the extension **does** respect
any file rules in your coding standard, this option allows you to define additional rules.

### Autofix on Save

 Rather than providing an option here, this extension encourages you to use the built-in VS Code `editor.formatOnSave` option:

 ```json
 {
     "[php]": {
         "editor.formatOnSave": true,
         "editor.defaultFormatter": "obliviousharmony.vscode-php-codesniffer"
     }
 }
 ```

## Using in Containerized Development Environments (`phpCodeSniffer.autoloadPHPCSIntegration`)

If you are using a container for your development environment we would _strongly_ recommend using one of [VS Code's remote development extensions](https://code.visualstudio.com/docs/remote/remote-overview). However, if this is not possible, [we have provided a Composer package with the files required to integrate with PHPCS](./assets/phpcs-integration). You _must_ install these files alongside PHPCS (globally or per-project) in order for the extension to work properly. Once you have installed the package it will be used instead of the build-in integration when `phpCodeSniffer.autoloadPHPCSIntegration` is enabled.
