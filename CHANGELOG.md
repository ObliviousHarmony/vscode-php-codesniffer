# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.2] - 2024-09-17
### Fixed
- Improved the argument parsing for the PHPCS executable options.

## [3.0.1] - 2024-01-29
### Fixed
- Composer package should not contain unnecessary files.

## [3.0.0] - 2024-01-29
### Added
- Support using an `obliviousharmony/vscode-phpcs-integration` Composer package to provide
the integration files when a new `phpCodeSniffer.autoloadPHPCSIntegration` option
is enabled.

### Removed
- **BREAKING:** The `phpCodeSniffer.specialOptions.phpcsIntegrationPathOverride` option
has been removed in favor of using `phpCodeSniffer.autoloadPHPCSIntegration`.
There is no reason to set a manual asset path since the Composer package accomplishes
the same thing with an easier-to-use configuration path.

## [2.3.0] - 2024-01-26
### Added
- `phpCodeSniffer.specialOptions` option to allow for supporting narrow use-cases without
needing to add options that most users will not need.
- `phpCodeSniffer.specialOptions.phpcsIntegrationPathOverride` option that allows for
overriding the path to the directory containing the extension's PHPCS integration.

### Changed
- All applicable configuration options should be able to be set at the folder level.

## [2.2.0] - 2023-11-07
### Fixed
- Workers should still be freed when PHPCS does not run.
- Clear diagnostics when exceptions are thrown while updating them.
- Clear diagnostics on configuration changes.
- Excluded files should be ignored earlier to avoid errors.
- Avoid diagnostic conflicts between file changes and saving.

## [2.1.0] - 2023-04-19
### Added
- Display messages for configuration errors.

### Fixed
- Detect `phpcs.xml.dist` and `.phpcs.xml.dist` configuration files.
- Detection of filesystem root when traversing paths on Windows.

## [2.0.0] - 2023-04-13
### Added
- `Automatic` option for `phpCodeSniffer.standard` that searches for a coding standard file
(`phpcs.xml`, `.phpcs.xml`, `phpcs.xml.dist`, `.phpcs.xml.dist`). The search begins in the
document's folder and traverses through parent folders until it reaches the workspace root.
- `phpCodeSniffer.exec.linux`, `phpCodeSniffer.exec.osx`, and `phpCodeSniffer.exec.windows` options
for platform-specific executables.
- Support for execution on Windows without the use of WSL.

### Changed
- **BREAKING:** Even if `phpCodeSniffer.autoExecutable` is enabled, the working directory given to
PHPCS should always be the workspace root.

### Deprecated
- `phpCodeSniffer.executable` has been deprecated in favor of platform-specific executable options.

### Fixed
- Gracefully handle errors caused by an invalid PHPCS executable setting.

### Deprecated
- `phpCodeSniffer.executable` has been deprecated in favor of using platform-specific executables.

## [1.7.0] - 2022-07-29
### Added
- Use glob patterns to exclude files and folders from linting using the `phpCodeSniffer.exclude` option.

### Fixed
- Document formatting with no changes clears diagnostics.
- Document selection formatting only works on the first character of the diagnostic.

### Deprecated
- `phpCodeSniffer.ignorePatterns` has been deprecated in favor of using glob patterns over regular expressions.

## [1.6.0] - 2022-05-06
### Fixed
- `phpCodeSniffer.executable` options with spaces throwing errors.

## [1.5.0] - 2021-12-10
### Fixed
- Broken PHPCS integration due to inconsistent class loading behavior.

## [1.4.0] - 2021-08-13
### Added
- Linter's execution action can be set by the `phpCodeSniffer.lintAction` option.
- Command `phpCodeSniffer.cancelProcessing` to cancel all active processing.

## [1.3.0] - 2021-05-24
### Fixed
- Maps and Sets should not be keyed by the Uri instance directly.
- Linter status should be cleared when a diagnostic is cancelled.

## [1.2.0] - 2021-05-21
### Added
- Status bar indicator when PHPCS is generating diagnostics.

### Fixed
- Erroneous PHP output should not break PHPCS report parsing.
- Diagnostics should not be generated for Source Control git content.
- PHPCS reports throwing exceptions when parsing fails internally.

## [1.1.0] - 2021-03-04
### Added
- Ignore diagnostics for files using the `phpCodeSniffer.ignorePatterns` option.

### Fixed
- "Ignore * for this line" action should be present for all diagnostics.

## [1.0.0] - 2021-03-01
### Fixed
- Pass file path to PHPCS for use in sniffs.
- Handle Uri schemes other than `'file'`.

## [0.4.1] - 2021-02-22
### Fixed
- Only trigger diagnostic updates when changes have occurred.
- Dispose of `Logger` correctly.

## [0.4.0] - 2021-02-21
### Added
- Automatically attempt to find a `bin/phpcs` file in a vendor folder when `phpCodeSniffer.autoExecutable` is enabled.
- Display PHPCS errors to the user.
- Check document version before unnecessarily rebuilding diagnostics.

### Fixed
- Range formatting.

## [0.3.1] - 2021-02-16
### Fixed
- Custom PHPCS report paths in package.

## [0.3.0] - 2021-02-16
### Added
- "Default" standard option that allows PHPCS to decide which standard to use.

## [0.2.0] - 2021-02-12
### Added
- Format Document and Format Document Selection support.
- Action to add ignore comment for problem to a line.

### Changed
- Refactored the DocumentTracker and WorkspaceTracker into separate services and providers to increase performance.

### Fixed
- Fix unresolved promises caused by unhandled errors in workers.

## [0.1.0] - 2021-02-09
### Added
- Custom PHPCS reports for diagnostic and code action resolution.
- Worker and WorkerPool for processing asynchronous requests to PHPCS.
- WorkspaceTracker for listening to document and configuration events.
- DocumentTracker for providing diagnostic and code action data to VS Code.
