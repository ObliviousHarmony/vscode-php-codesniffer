import { TextDocument, Uri, workspace as vsCodeWorkspace } from 'vscode';

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
    public get(document: TextDocument): Promise<DocumentConfiguration> {
        let config = this.cache.get(document.uri);
        if (config) {
            return Promise.resolve(config);
        }

        // Read the configuration and cache it to avoid doing so again.
        const read = this.readConfiguration(document);
        config = {
            workingDirectory: this.inferWorkingDirectory(document),
            executable: read.executable,
            standard: read.standard
        };
        this.cache.set(document.uri, config);

        return Promise.resolve(config);
    }

    /**
     * Clears the cached configuration.
     */
    public clearCache(): void {
        this.cache.clear();
    }

    /**
     * Reads the configuration for a document and returns the relevant data.
     *
     * @param {TextDocument} document The document to read.
     */
    private readConfiguration(document: TextDocument): Pick<DocumentConfiguration, 'standard'|'executable'> {
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

        const executable = config.get<string>('executable');
        if (!executable) {
            throw new Error('The extension has no worker configured');
        }

        return { standard, executable };
    }

    /**
     * Infers the working directory of a document and returns it.
     *
     * @param {TextDocument} document The document to check.
     */
    private inferWorkingDirectory(document: TextDocument): string {
        // When the file is in a workspace we should assume that is the working directory.
        const folder = this.workspace.getWorkspaceFolder(document.uri);
        if (folder) {
            return folder.uri.fsPath;
        }

        // Our next best option is the root path.
        if (this.workspace.workspaceFolders && this.workspace.workspaceFolders.length > 0) {
            return this.workspace.workspaceFolders[0].uri.fsPath;
        }

        // When we can't infer a path just use the path of the document.
        return document.uri.fsPath;
    }
}
