import { TextDecoder } from 'util';
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
 * An enum describing the values in the `phpcsCodeSniffer.standard` configuration.
 */
export enum StandardType {
	Disabled = 'Disabled',
	Default = 'Default',
	PEAR = 'PEAR',
	MySource = 'MySource',
	Squiz = 'Squiz',
	PSR1 = 'PSR1',
	PSR12 = 'PSR12',
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
	ignorePatterns: RegExp[];
	lintAction: LintAction;
	standard: string;
}

/**
 * An interface descirinb the shape of a document's configuration.
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
	 * The ignore patterns we should use when executing reports/
	 */
	ignorePatterns: RegExp[];

	/**
	 * The editor action that should trigger the linter.
	 */
	lintAction: LintAction;

	/**
	 * The standard we should use when executing reports.
	 */
	standard: StandardType | string;
}

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
		const fromConfig = this.readConfiguration(document);
		const fromFilesystem = await this.readFilesystem(
			document,
			fromConfig.autoExecutable,
			cancellationToken
		);

		// Build and cache the document configuration to save time later.
		config = {
			workingDirectory: fromFilesystem.workingDirectory,
			executable: fromFilesystem.executable ?? fromConfig.executable,
			ignorePatterns: fromConfig.ignorePatterns,
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
			const executable = findExecutable
				? await this.findExecutable(
						document.uri,
						workspaceFolder,
						cancellationToken
				  )
				: null;
			if (executable) {
				fsParams.workingDirectory = executable.workingDirectory;
				fsParams.executable = executable.executable;
			}
		}

		return fsParams;
	}

	/**
	 * Reads the configuration for a document and returns the relevant data.
	 *
	 * @param {TextDocument} document The document to read.
	 */
	private readConfiguration(document: TextDocument): ParamsFromConfiguration {
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
				'The extension has an invalid `autoExecutable` configuration.'
			);
		}

		const executable = config.get<string>('executable');
		if (executable === undefined) {
			throw new Error(
				'The extension has an invalid `executable` configuration.'
			);
		}

		const rawPatterns = config.get<string[]>('ignorePatterns');
		if (!Array.isArray(rawPatterns)) {
			throw new Error(
				'The extension has an invalid `ignorePatterns` configuration.'
			);
		}
		const ignorePatterns = rawPatterns.map((v) => new RegExp(v));

		const lintAction = config.get<LintAction>('lintAction');
		if (lintAction === undefined) {
			throw new Error(
				'The extension has an invalid `lintAction` configuration.'
			);
		}

		let standard = config.get<string>('standard');
		if (standard === StandardType.Custom) {
			standard = config.get<string>('standardCustom');
		}
		if (!standard) {
			standard = StandardType.Disabled;
		}

		return {
			autoExecutable,
			executable,
			ignorePatterns,
			lintAction,
			standard,
		};
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

		// When we can't infer a path just use the directory of the document.
		return Uri.joinPath(document.uri, '..');
	}

	/**
	 * Attempts to find an executable by traversing from the document's directory to the workspace folder.
	 *
	 * @param {Uri} documentUri The URI of the document to find an executable for.
	 * @param {Uri} workspaceFolder The URI of the workspace folder for the document.
	 * @param {CancellationToken} [cancellationToken] The optional token for cancelling the request.
	 */
	private async findExecutable(
		documentUri: Uri,
		workspaceFolder: Uri,
		cancellationToken?: CancellationToken
	): Promise<ExecutablePath | null> {
		// Where we start the traversal will depend on the scheme of the document.
		let directory: Uri;
		switch (documentUri.scheme) {
			// Untitled files have no path and should just check the workspace folder.
			case 'untitled':
				directory = workspaceFolder;
				break;

			// Real files will traverse from their directory to the workspace folder.
			case 'file':
				directory = Uri.joinPath(documentUri, '..');
				break;

			// Since we can't execute the binary in any other scheme there's nothing to do.
			default:
				return null;
		}

		// We're going to traverse from the file's directory to the workspace
		// folder looking for an executable that can be used in the worker.
		while (directory.path !== '/') {
			// When the request is cancelled, we don't want to keep looking.
			if (cancellationToken?.isCancellationRequested) {
				throw new CancellationError();
			}

			const found = await this.findExecutableInDirectory(directory);
			if (found) {
				return found;
			}

			// Stop once we reach the workspace folder.
			if (directory.toString() === workspaceFolder.toString()) {
				break;
			}

			// Move to the parent directory and check again.
			directory = Uri.joinPath(directory, '..');
		}

		return null;
	}

	/**
	 * Attempts to find an executable in the given directory and returns the path to it if found.
	 *
	 * @param {Uri} directory The directory we're checking for an executable in.
	 */
	private async findExecutableInDirectory(
		directory: Uri
	): Promise<ExecutablePath | null> {
		try {
			// We should be aware of custom vendor directories so that
			// we can find the executable in the correct location.
			const composerPath = Uri.joinPath(directory, 'composer.json');

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

			// The stat() call will throw an error if the file could not be found.
			const phpcsPath = Uri.joinPath(directory, vendorDir + '/bin/phpcs');
			await this.workspace.fs.stat(phpcsPath);

			// The lack of an error indicates that the file exists.
			return {
				workingDirectory: directory.fsPath,
				executable: phpcsPath.fsPath,
			};
		} catch (e) {
			// Only errors from the filesystem are relevant.
			if (!(e instanceof FileSystemError)) {
				throw e;
			}
		}

		return null;
	}
}
