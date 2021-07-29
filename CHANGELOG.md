# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Command `phpCodeSniffer.cancelProcessing` to cancel all active processing.

## [1.3.0] - 2021-05-24
### Fixed
- Maps and Sets should not be keyed by the Uri instance directly.
- Linter status should be cleared when a diagnostic is cancelled.

## [1.2.0] - 2021-05-21
### Added
- Status bar indicator when PHPCS is generating diagnosts.

### Fixed
- Erroneous PHP output should not break PHPCS report parsing.
- Diagnostics should not be generated for Source Control git content.
- PHPCS reports throwing exceptions when parsing fails internally.

## [1.1.0] - 2021-03-04
### Added
- Ignore diagnostics for files using `phpCodeSniffer.ignorePatterns` option.

### Fixed
- "Ignore * for this line" action should be present for all diagnostics.

## [1.0.0] - 2021-03-01
### Fixed
- Pass file path to `phpcs` for use in sniffs.
- Handle Uri schemes other than `'file'`.

## [0.4.1] - 2021-02-22
### Fixed
- Only trigger diagnostic updates when changes have occurred.
- Dispose of `Logger` correctly.

## [0.4.0] - 2021-02-21
### Added
- Automatically attempt to find a `bin/phpcs` file in a vendor directory when `phpCodeSniffer.autoExecutable` is enabled.
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
