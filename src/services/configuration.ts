import { resolve as resolvePath } from 'path';
import { TextDecoder } from 'util';
import { Minimatch } from 'minimatch';
import {
	CancellationError,
	CancellationToken,
	FileSystemError,
	TextDocument,
	Uri,
	workspace as vsCodeWorkspace,
} from 'vscode';
import { UriMap } from '../common/uri-map';
import { WorkspaceLocator } from './workspace-locator';

/**
 * A constant for the version of the PHPCS integration files.
 * This should be incremented if the files are changed so
 * that we can provide a clear error message.
 */
export const PHPCS_INTEGRATION_VERSION = '1.0.0';

/**
 * An enum describing the special parsing values in the `phpCodeSniffer.standard` configuration.
 */
export enum SpecialStandardOptions {
	/**
	 * Disable linting for the document entirely.
	 */
	Disabled = 'Disabled',

	/**
	 * Skip passing a `--standard` to PHPCS and let it decide what standard to use.
	 */
	Default = 'Default',

	/**
	 * Search for a custom standard file in the document's folder and parent folders.
	 */
	Automatic = 'Automatic',

	/**
	 * Use the contents of the `phpCodeSniffer.standardCustom` configuration.
	 */
	Custom = 'Custom',
}

/**
 * An enum describing the values in the `phpCodeSniffer.lintAction` configuration.
 */
export enum LintAction {
	Change = 'Change',
	Save = 'Save',

	// These are limited to code, and aren't part of the configuration options.
	Force = 'Force',
}

/**
 * An interface describing the narrow use-case options in the `phpCodeSniffer.specialOptions` configuration.
 */
export interface SpecialOptions {
	/**
	 * An override for the path to the directory containing the extension's PHPCS integration files.
	 */
	phpcsIntegrationPathOverride?: string;
}

/**
 * An interface describing the configuration parameters we can read from the filesystem.
 */
interface ParamsFromFilesystem {
	executable?: string;
}

/**
 * An interface describing the configuration parameters we can read from the workspace configuration.
 */
interface ParamsFromConfiguration {
	autoExecutable: boolean;
	executable: string;
	exclude: RegExp[];
	lintAction: LintAction;
	standard: string | null;
	phpcsIntegrationPath: string;
}

/**
 * An interface describing the shape of a document's configuration.
 */
export interface DocumentConfiguration {
	/**
	 * The executable we should use in the worker.
	 */
	executable: string;

	/**
	 * The patterns we should use when excluding files and folders from reports.
	 */
	exclude: RegExp[];

	/**
	 * The editor action that should trigger the linter.
	 */
	lintAction: LintAction;

	/**
	 * The standard we should use when executing reports.
	 */
	standard: string | null;

	/**
	 * The path to the PHPCS integration files.
	 */
	phpcsIntegrationPath: string;
}

/**
 * The type for the callback used when traversing workspace folders.
 */
type FolderTraversalCallback<T> = (folderUri: Uri) => Promise<T | false>;

/**
 * A custom error type for those that come from PHPCS.
 */
export class ConfigurationError extends Error {
	/**
	 * The configuration key the error is for.
	 */
	public readonly configurationKey: string;

	/**
	 * The error message for the configuration key.
	 */
	public readonly errorMessage: string;

	/**
	 * Constructor.
	 *
	 * @param {string} configurationKey The configuration key the error is for.
	 * @param {string} message The message for the error.
	 */
	public constructor(configurationKey: string, message: string) {
		super(
			'Configuration "phpCodeSniffer.' +
				configurationKey +
				'" Error: ' +
				message
		);

		this.configurationKey = configurationKey;
		this.errorMessage = message;
	}
}

/**
 * The valid filenames we look for when automatically searching for coding standards.
 */
export const AutomaticCodingStandardFilenames = [
	'phpcs.xml',
	'.phpcs.xml',
	'phpcs.xml.dist',
	'.phpcs.xml.dist',
];

/**
 * A class for reading our configuration.
 */
export class Configuration {
	/**
	 * The VS Code workspace that we will load the configuration from.
	 */
	private readonly workspace: typeof vsCodeWorkspace;

	/**
	 * The locator we will use to look at the workspace.
	 */
	private readonly workspaceLocator: WorkspaceLocator;

	/**
	 * A cache containing all of the configurations we've loaded.
	 */
	private readonly cache: UriMap<DocumentConfiguration>;

	/**
	 * The decoder for parsing file content into strings for consumption.
	 */
	private readonly textDecoder: TextDecoder;

	/**
	 * Constructor.
	 *
	 * @param {workspace} workspace The VS Code workspace our configuration is in.
	 * @param {WorkspaceLocator} workspaceLocator The locator we will use to look at the workspace.
	 */
	public constructor(
		workspace: typeof vsCodeWorkspace,
		workspaceLocator: WorkspaceLocator
	) {
		this.workspace = workspace;
		this.workspaceLocator = workspaceLocator;
		this.cache = new UriMap();
		this.textDecoder = new TextDecoder();
	}

	/**
	 * Fetches the configuration for the given document.
	 *
	 * @param {TextDocument} document The document we want to fetch the config for.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	public async get(
		document: TextDocument,
		cancellationToken?: CancellationToken
	): Promise<DocumentConfiguration> {
		let config = this.cache.get(document.uri);
		if (config) {
			return config;
		}

		// Read the configuration and filesystem to build our document's configuration.
		const fromConfig = await this.readConfiguration(
			document,
			cancellationToken
		);
		const fromFilesystem = await this.readFilesystem(
			document,
			fromConfig.autoExecutable,
			cancellationToken
		);

		// Build and cache the document configuration to save time later.
		config = {
			executable: fromFilesystem.executable ?? fromConfig.executable,
			exclude: fromConfig.exclude,
			lintAction: fromConfig.lintAction,
			standard: fromConfig.standard,
			phpcsIntegrationPath: fromConfig.phpcsIntegrationPath,
		};
		this.cache.set(document.uri, config);

		return config;
	}

	/**
	 * Clears the cached configuration.
	 *
	 * @param {TextDocument} [document] The document to limit clearing to.
	 */
	public clearCache(document?: TextDocument): void {
		if (document) {
			this.cache.delete(document.uri);
			return;
		}

		this.cache.clear();
	}

	/**
	 * Reads the configuration for a document and returns the relevant data.
	 *
	 * @param {TextDocument} document The document to read.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async readConfiguration(
		document: TextDocument,
		cancellationToken?: CancellationToken
	): Promise<ParamsFromConfiguration> {
		const config = this.workspace.getConfiguration(
			'phpCodeSniffer',
			document
		);
		if (!config) {
			throw new ConfigurationError(
				'phpCodeSniffer',
				'The extension has no configuration.'
			);
		}

		const autoExecutable = config.get<boolean>('autoExecutable');
		if (autoExecutable === undefined) {
			throw new ConfigurationError(
				'autoExecutable',
				'Value must be a boolean.'
			);
		}

		// Use a platform-specific executable setting.
		let executableSetting: string;
		switch (process.platform) {
			case 'win32':
				executableSetting = 'exec.windows';
				break;
			case 'darwin':
				executableSetting = 'exec.osx';
				break;
			default:
				executableSetting = 'exec.linux';
				break;
		}
		const platformExecutable = config.get<string>(executableSetting);
		if (platformExecutable === undefined) {
			throw new ConfigurationError(
				executableSetting,
				'Value must be a string.'
			);
		}

		// Support the deprecated `executable` setting that should override the platform-specific one.
		const deprecatedExecutable = config.get<string | null>('executable');
		const executable = deprecatedExecutable ?? platformExecutable;

		const excludePatterns = config.get<string[]>('exclude');
		if (!Array.isArray(excludePatterns)) {
			throw new ConfigurationError('exclude', 'Value must be an array.');
		}

		// Parse the glob patterns into a format we can use.
		const exclude: RegExp[] = [];
		for (const pattern of excludePatterns) {
			const match = new Minimatch(pattern);
			const regex = match.makeRe();
			if (!regex) {
				continue;
			}

			exclude.push(regex);
		}

		// Support the deprecated `ignorePatterns` option.
		const deprecatedIgnorePatterns = config.get<string[] | null>(
			'ignorePatterns'
		);
		if (deprecatedIgnorePatterns) {
			if (!Array.isArray(deprecatedIgnorePatterns)) {
				throw new ConfigurationError(
					'ignorePatterns',
					'Value must be an array'
				);
			}

			exclude.push(...deprecatedIgnorePatterns.map((v) => new RegExp(v)));
		}

		const lintAction = config.get<LintAction>('lintAction');
		if (lintAction === undefined) {
			throw new ConfigurationError(
				'lintAction',
				'Value must be a valid lint action.'
			);
		}

		// We're going to parse the standard so that outside of this method
		// we have a standard that can be easily passed to the worker.
		const rawStandard = config.get<SpecialStandardOptions | string>(
			'standard'
		);
		if (rawStandard === undefined) {
			throw new ConfigurationError(
				'standard',
				'Value must be a valid standard option.'
			);
		}
		const standard = await this.parseStandard(
			document,
			exclude,
			rawStandard,
			config.get<string>('standardCustom'),
			cancellationToken
		);

		const specialOptions = config.get<SpecialOptions>('specialOptions');
		if (specialOptions === undefined) {
			throw new ConfigurationError(
				'specialOptions',
				'Value must be an object.'
			);
		}

		// Use the default integration path unless overridden.
		let phpcsIntegrationPath: string;
		if (specialOptions.phpcsIntegrationPathOverride) {
			phpcsIntegrationPath = specialOptions.phpcsIntegrationPathOverride;
		} else {
			// Keep in mind that after bundling the integration files will be in a different location
			// than they are in development and we need to resolve the correct path.
			phpcsIntegrationPath = resolvePath(
				__dirname,
				'assets',
				'phpcs-integration'
			);
		}

		return {
			autoExecutable,
			executable,
			exclude,
			lintAction,
			standard,
			phpcsIntegrationPath,
		};
	}

	/**
	 * Parses the coding standard configuration options into a single string that
	 * can be readily given to the worker without any other parsing.
	 *
	 * @param {TextDocument} document The document to read.
	 * @param {Array.<RegExp>} exclude The path exclusion rules to check.
	 * @param {SpecialStandardOptions|string} standard The special standard option or string literal to use.
	 * @param {string} [customStandard] The string to use with the `Custom` special standard option.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async parseStandard(
		document: TextDocument,
		exclude: RegExp[],
		standard: SpecialStandardOptions | string,
		customStandard?: string,
		cancellationToken?: CancellationToken
	): Promise<string | null> {
		// Linting should be disabled for documents that are excluded.
		for (const pattern of exclude) {
			if (pattern.test(document.uri.fsPath)) {
				return null;
			}
		}

		// There are some special standard options that require some parsing.
		switch (standard) {
			// Linting will not be performed when the standard is null.
			case SpecialStandardOptions.Disabled:
				return null;

			// No standard is passed when it is an empty string.
			case SpecialStandardOptions.Default:
				return '';

			case SpecialStandardOptions.Custom:
				if (!customStandard) {
					throw new ConfigurationError(
						'customStandard',
						'Must be a string when using a custom standard.'
					);
				}

				return customStandard;

			// Use the automatic standard discovery below when desired.
			case SpecialStandardOptions.Automatic:
				break;

			// Any other standard options are just string literals to pass to the linter.
			default:
				return standard;
		}

		const parsed = await this.traverseWorkspaceFolders(
			document.uri,
			(uri) => this.findCodingStandardFile(uri),
			cancellationToken
		);
		if (parsed === false) {
			throw new ConfigurationError(
				'standard',
				'Failed to locate a PHPCS configuration file for "' +
					document.uri.fsPath +
					'".'
			);
		}

		return parsed;
	}

	/**
	 * Reads the configuration for a document from the filesystem and resolves it.
	 *
	 * @param {TextDocument} document The document to read.
	 * @param {boolean} findExecutable Indicates whether or not we should perform an executable search.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async readFilesystem(
		document: TextDocument,
		findExecutable: boolean,
		cancellationToken?: CancellationToken
	): Promise<ParamsFromFilesystem> {
		// When an executable is requested we should attempt to populate the params with one.
		if (findExecutable) {
			const executable = await this.traverseWorkspaceFolders(
				document.uri,
				(uri) => this.findExecutableInFolder(uri),
				cancellationToken
			);

			if (executable !== false) {
				return { executable };
			}
		}

		return {};
	}

	/**
	 * Traverses from the document's folder to the workspace folder, executing
	 * a callback on each Uri until the caller finds what they are looking for.
	 *
	 * @param {Uri} documentUri The Uri of the document we are traversing from.
	 * @param {FolderTraversalCallback} callback The callback to execute on each Uri in the traversal.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async traverseWorkspaceFolders<T>(
		documentUri: Uri,
		callback: FolderTraversalCallback<T>,
		cancellationToken?: CancellationToken
	): Promise<T | false> {
		const workspaceFolder =
			this.workspaceLocator.getWorkspaceFolderOrDefault(documentUri);

		// Where we start the traversal will depend on the scheme of the document.
		let folder: Uri;
		switch (documentUri.scheme) {
			// Untitled files have no path and should just check the workspace folder.
			case 'untitled':
				folder = workspaceFolder;
				break;

			// Real files will traverse from their folder to the workspace folder.
			case 'file':
				folder = Uri.joinPath(documentUri, '..');
				break;

			// Since we can't execute the binary in any other scheme there's nothing to do.
			default:
				return false;
		}

		// When we reach the filesystem root we have no reason to keep searching.
		while (!folder.path.match(/^(?:[a-z]:)?\/$/i)) {
			// When the request is cancelled, we don't want to keep looking.
			if (cancellationToken?.isCancellationRequested) {
				throw new CancellationError();
			}

			// Let the caller decide whether or not the given
			// Uri is what they're looking for and return
			// whatever the caller wants to consume.
			const found = await callback(folder);
			if (found !== false) {
				return found;
			}

			// Stop once we reach the workspace folder.
			if (folder.toString() === workspaceFolder.toString()) {
				break;
			}

			// Move to the parent folder and check again.
			folder = Uri.joinPath(folder, '..');
		}

		return false;
	}

	/**
	 * Attempts to find a coding standard file in the given folder and returns the path to it if found.
	 *
	 * @param {Uri} folder The folder we're checking for a coding standard file.
	 */
	private async findCodingStandardFile(folder: Uri): Promise<string | false> {
		// Look for any of the valid coding standard filenames.
		for (const filename of AutomaticCodingStandardFilenames) {
			try {
				// The stat() call will throw an error if the file could not be found.
				const codingStandardPath = Uri.joinPath(folder, filename);
				await this.workspace.fs.stat(codingStandardPath);

				return codingStandardPath.fsPath;
			} catch (e) {
				// Only errors from the filesystem are relevant.
				if (!(e instanceof FileSystemError)) {
					throw e;
				}
			}
		}

		return false;
	}

	/**
	 * Attempts to find an executable in the given folder and returns the path to it if found.
	 *
	 * @param {Uri} folder The folder we're checking for an executable in.
	 */
	private async findExecutableInFolder(folder: Uri): Promise<string | false> {
		try {
			// We should be aware of custom vendor folders so that
			// we can find the executable in the correct location.
			const composerPath = Uri.joinPath(folder, 'composer.json');

			const composerFile = JSON.parse(
				this.textDecoder.decode(
					await this.workspace.fs.readFile(composerPath)
				)
			);

			let vendorDir = 'vendor';
			if (
				composerFile &&
				composerFile.config &&
				composerFile.config['vendor-dir']
			) {
				vendorDir = composerFile.config['vendor-dir'];
			}

			// Make sure to find a platform-specific executable.
			const phpcsPath = Uri.joinPath(
				folder,
				vendorDir,
				'bin',
				process.platform === 'win32' ? 'phpcs.bat' : 'phpcs'
			);

			// The stat() call will throw an error if the file could not be found.
			await this.workspace.fs.stat(phpcsPath);

			// The lack of an error indicates that the file exists.
			return phpcsPath.fsPath;
		} catch (e) {
			// Only errors from the filesystem are relevant.
			if (!(e instanceof FileSystemError)) {
				throw e;
			}
		}

		return false;
	}
}
