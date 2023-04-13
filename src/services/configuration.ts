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
 * An interface describing the path to an executable.
 */
interface ExecutablePath {
	workingDirectory: string;
	executable: string;
}

/**
 * An interface describing the configuration parameters we can read from the filesystem.
 */
interface ParamsFromFilesystem {
	workingDirectory: string;
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
}

/**
 * An interface describing the shape of a document's configuration.
 */
export interface DocumentConfiguration {
	/**
	 * The working directory we should use when executing reports.
	 */
	workingDirectory: string;

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
}

/**
 * The type for the callback used when traversing workspace folders.
 */
type FolderTraversalCallback<T> = (folderUri: Uri) => Promise<T | false>;

/**
 * The valid filenames we look for when automatically searching for coding standards.
 */
export const AutomaticCodingStandardFilenames = [
	'phpcs.xml',
	'.phpcs.xml',
	'phpcs.dist.xml',
	'.phpcs.dist.xml',
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
	 */
	public constructor(workspace: typeof vsCodeWorkspace) {
		this.workspace = workspace;
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
			workingDirectory: fromFilesystem.workingDirectory,
			executable: fromFilesystem.executable ?? fromConfig.executable,
			exclude: fromConfig.exclude,
			lintAction: fromConfig.lintAction,
			standard: fromConfig.standard,
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
			throw new Error('The extension has no configuration.');
		}

		const autoExecutable = config.get<boolean>('autoExecutable');
		if (autoExecutable === undefined) {
			throw new Error(
				'The extension has an invalid `phpCodeSniffer.autoExecutable` configuration.'
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
			throw new Error(
				'The extension has an invalid `' +
					executableSetting +
					'` configuration.'
			);
		}

		// Support the deprecated `executable` setting that should override the platform-specific one.
		const deprecatedExecutable = config.get<string | null>('executable');
		const executable = deprecatedExecutable ?? platformExecutable;

		const excludePatterns = config.get<string[]>('exclude');
		if (!Array.isArray(excludePatterns)) {
			throw new Error(
				'The extension has an invalid `phpCodeSniffer.exclude` configuration.'
			);
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
				throw new Error(
					'The extension has an invalid `phpCodeSniffer.ignorePatterns` configuration.'
				);
			}

			exclude.push(...deprecatedIgnorePatterns.map((v) => new RegExp(v)));
		}

		const lintAction = config.get<LintAction>('lintAction');
		if (lintAction === undefined) {
			throw new Error(
				'The extension has an invalid `phpCodeSniffer.lintAction` configuration.'
			);
		}

		// We're going to parse the standard so that outside of this method
		// we have a standard that can be easily passed to the worker.
		const rawStandard = config.get<SpecialStandardOptions | string>(
			'standard'
		);
		if (rawStandard === undefined) {
			throw new Error(
				'The extension has an invalid `phpCodeSniffer.standard` configuration.'
			);
		}
		const standard = await this.parseStandard(
			document,
			rawStandard,
			config.get<string>('standardCustom'),
			cancellationToken
		);

		return {
			autoExecutable,
			executable,
			exclude,
			lintAction,
			standard,
		};
	}

	/**
	 * Parses the coding standard configuration options into a single string that
	 * can be readily given to the worker without any other parsing.
	 *
	 * @param {TextDocument} document The document to read.
	 * @param {SpecialStandardOptions|string} standard The special standard option or string literal to use.
	 * @param {string} [customStandard] The string to use with the `Custom` special standard option.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async parseStandard(
		document: TextDocument,
		standard: SpecialStandardOptions | string,
		customStandard?: string,
		cancellationToken?: CancellationToken
	): Promise<string | null> {
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
					throw new Error(
						'The extension has an empty `phpCodeSniffer.standardCustom` configuration.'
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

		// We are only going to traverse as high as the workspace folder.
		const workspaceFolder = this.getWorkspaceFolder(document);

		const parsed = await this.traverseWorkspaceFolders(
			document.uri,
			workspaceFolder,
			(uri) => this.findCodingStandardFile(uri),
			cancellationToken
		);
		if (parsed === false) {
			return null;
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
		// The workspace folder for the document is our default working directory.
		const workspaceFolder = this.getWorkspaceFolder(document);

		// Prepare the parameters that come from the filesystem.
		const fsParams: ParamsFromFilesystem = {
			workingDirectory: workspaceFolder.fsPath,
		};

		// When an executable is requested we should attempt to populate the params with one.
		if (findExecutable) {
			const executable = await this.traverseWorkspaceFolders(
				document.uri,
				workspaceFolder,
				(uri) => this.findExecutableInFolder(uri),
				cancellationToken
			);

			if (executable !== false) {
				fsParams.workingDirectory = executable.workingDirectory;
				fsParams.executable = executable.executable;
			}
		}

		return fsParams;
	}

	/**
	 * Fetches the workspace folder of a document or the folder immediately enclosing the file.
	 *
	 * @param {TextDocument} document The document to check.
	 */
	private getWorkspaceFolder(document: TextDocument): Uri {
		// When the file is in a workspace we should assume that is the working directory.
		const folder = this.workspace.getWorkspaceFolder(document.uri);
		if (folder) {
			return folder.uri;
		}

		// Our next best option is the root path.
		if (
			this.workspace.workspaceFolders &&
			this.workspace.workspaceFolders.length > 0
		) {
			return this.workspace.workspaceFolders[0].uri;
		}

		// When we can't infer a path just use the folder of the document.
		return Uri.joinPath(document.uri, '..');
	}

	/**
	 * Traverses from the document's folder to the workspace folder, executing
	 * a callback on each Uri until the caller finds what they are looking for.
	 *
	 * @param {Uri} documentUri The Uri of the document we are traversing from.
	 * @param {Uri} workspaceFolder The workspace folder that is the highest we should traverse.
	 * @param {FolderTraversalCallback} callback The callback to execute on each Uri in the traversal.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async traverseWorkspaceFolders<T>(
		documentUri: Uri,
		workspaceFolder: Uri,
		callback: FolderTraversalCallback<T>,
		cancellationToken?: CancellationToken
	): Promise<T | false> {
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

		// Only traverse as far as the workspace folder. We don't
		// want to accidentally check folders outside of it.
		while (folder.path !== '/') {
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
	private async findExecutableInFolder(
		folder: Uri
	): Promise<ExecutablePath | false> {
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
			return {
				workingDirectory: folder.fsPath,
				executable: phpcsPath.fsPath,
			};
		} catch (e) {
			// Only errors from the filesystem are relevant.
			if (!(e instanceof FileSystemError)) {
				throw e;
			}
		}

		return false;
	}
}
