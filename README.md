# VS Code PHP_CodeSniffer Extension

Integrates [PHP_CodeSniffer](https://github.com/squizlabs/PHP_CodeSniffer) into VS Code.

This extension uses the version of PHPCS defined by the platform-specific executable setting. Through the use of
custom reports we are able to generate diagnostics, code actions, and document formatting that fully utilizes
VS Code's available features.

## Configuration

_**Until you configure it, this extension will not lint any files.**_

### Standard (`phpCodeSniffer.standard`)

This dropdown and accompanying text input allow you to define the standard or ruleset path to use. When set to
`Default` we rely on PHPCS to decide on the standard based on its own configuration. When set to `Custom` we
pass the content of `phpCodeSniffer.standardCustom` to PHPCS; allowing you to define a custom rulset name or
use an XML file.

### Executable (`phpCodeSniffer.exec.linux`, `phpCodeSniffer.exec.osx`, and `phpCodeSniffer.exec.windows`)

This text input allows for setting a path to a platform-specific PHPCS executable. If a relative path is given it will be
based on the workspace root that the document resides in (untitled documents use the first root). You may also set the
`phpCodeSniffer.autoExecutable` option if you'd like for the extension to automatically search for an executable. This
works by looking for a `{vendor-dir}/bin/phpcs` (`{vendor-dir}\bin\phpcs.bat` on Windows) file in the document's directory and then
traversing up to the workspace folder if it does not find one. When it fails to find one automatically it will
fall back to the explicit option.

### File and Folder Exclusions (`phpCodeSniffer.exclude`)

This array of glob patterns allows you to exclude files and folders from linting. While the extension **does** respect
any file rules in your coding standard, this option allows you to define additional rules.
