import { FileSystemError, TextDocument, Uri, workspace as vsCodeWorkspace } from 'vscode';

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
    standard: string;
    autoExecutable: boolean;
    executable: string;
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
     * The standard we should use when executing reports.
     */
    standard: StandardType|string;
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
    private readonly cache: Map<Uri, DocumentConfiguration>;

    /**
     * Constructor.
     *
     * @param {workspace} workspace The VS Code workspace our configuration is in.
     */
    public constructor(workspace: typeof vsCodeWorkspace) {
        this.workspace = workspace;
        this.cache = new Map();
    }

    /**
     * Fetches the configuration for the given document.
     *
     * @param {TextDocument} document The document we want to fetch the config for.
     */
    public async get(document: TextDocument): Promise<DocumentConfiguration> {
        let config = this.cache.get(document.uri);
        if (config) {
            return config;
        }

        // Read the configuration and filesystem to build our document's configuration.
        const fromConfig = this.readConfiguration(document);
        const fromFilesystem = await this.readFilesystem(document, fromConfig.autoExecutable);

        // Build and cache the document configuration to save time later.
        config = {
            workingDirectory: fromFilesystem.workingDirectory,
            executable: fromFilesystem.executable ?? fromConfig.executable,
            standard: fromConfig.standard
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
     */
    private async readFilesystem(document: TextDocument, findExecutable: boolean): Promise<ParamsFromFilesystem> {
        // The top-level folder will serve as the endpoint for our traversal.
        const workspaceFolder = this.getWorkspaceFolder(document);

        // By default the working directory will be the workspace folder for the document.
        let workingDirectory = workspaceFolder.fsPath;

        // When desired we will attempt to find a PHPCS executable by scanning for a `vendor/bin/phpcs` file
        // in the document's directory. If that fails we will attempt the same in each parent directory
        // until we reach the workspace directory.
        let executable: string|undefined = undefined;
        if (findExecutable) {
            // Start in the document's directory.
            let dir: Uri = Uri.joinPath(document.uri, '..');
            while (dir.path !== '.') {
                const phpcsPath = Uri.joinPath(dir, 'vendor/bin/phpcs');
                try {
                    await this.workspace.fs.stat(phpcsPath);

                    // We've found an executable.
                    executable = phpcsPath.fsPath;

                    // The working directory should be considered the directory for the project containing PHPCS.
                    workingDirectory = dir.fsPath;
                    break;
                } catch (e) {
                    // Only errors indicating from the filesystem are relevant.
                    if (!(e instanceof FileSystemError)) {
                        throw e;
                    }

                    // Stop once we reach the workspace folder.
                    if (dir.toString() === workspaceFolder.toString()) {
                        break;
                    }

                    dir = Uri.joinPath(dir, '..');
                    continue;
                }
            }
        }

        return { workingDirectory, executable };
    }

    /**
     * Reads the configuration for a document and returns the relevant data.
     *
     * @param {TextDocument} document The document to read.
     */
    private readConfiguration(document: TextDocument): ParamsFromConfiguration {
        const config = this.workspace.getConfiguration('phpCodeSniffer', document);
        if (!config) {
            throw new Error('The extension has no configuration.');
        }

        let standard = config.get<string>('standard');
        if (standard === StandardType.Custom) {
            standard = config.get<string>('standardCustom');
        }
        if (!standard) {
            standard = StandardType.Disabled;
        }

        const autoExecutable = config.get<boolean>('autoExecutable');
        if (autoExecutable === undefined) {
            throw new Error('The extension has an invalid `autoExecutable` configuration.');
        }

        const executable = config.get<string>('executable');
        if (executable === undefined) {
            throw new Error('The extension has an invalid `executable` configuration.');
        }

        return { standard, autoExecutable, executable };
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
        if (this.workspace.workspaceFolders && this.workspace.workspaceFolders.length > 0) {
            return this.workspace.workspaceFolders[0].uri;
        }

        // When we can't infer a path just use the directory of the document.
        return Uri.joinPath(document.uri, '..');
    }
}
