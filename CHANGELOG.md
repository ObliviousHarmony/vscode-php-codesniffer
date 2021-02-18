# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Automatically attempt to find a `vendor/bin/phpcs` file when `phpCodeSniffer.autoExecutable` is enabled.

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
