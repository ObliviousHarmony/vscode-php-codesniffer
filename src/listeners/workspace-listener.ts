import {
    Disposable,
    TextDocument,
    Uri,
    window as vsCodeWindow,
    workspace as vsCodeWorkspace
} from 'vscode';
import { Configuration } from '../services/configuration';
import { CodeActionEditResolver } from '../services/code-action-edit-resolver';
import { DiagnosticUpdater } from '../services/diagnostic-updater';
import { DocumentFormatter } from '../services/document-formatter';

/**
 * A class for listening to the workspace and responding to events that occur.
 */
export class WorkspaceListener implements Disposable {
    /**
     * The configuration we're using.
     */
    private readonly configuration: Configuration;

    /**
     * The diagnostic updater we're using.
     */
    private readonly diagnosticUpdater: DiagnosticUpdater;

    /**
     * The code action edit resolver we're using.
     */
    private readonly codeActionEditResolver: CodeActionEditResolver;

    /**
     * The document formatter we're using.
     */
    private readonly documentFormatter: DocumentFormatter;

    /**
     * A map containing all of the documents we're currently tracking.
     */
    private readonly documents: Map<Uri, TextDocument>;

    /**
     * A map for applying a debounce to document updates.
     */
    private readonly updateDebounceMap: Map<Uri, NodeJS.Timeout>;

    /**
     * The subscriptions we have to VS Code events.
     */
    private readonly subscriptions: Disposable[];

    /**
     * Constructor.
     *
     * @param {Configuration} configuration The configuration to use.
     * @param {DiagnosticUpdater} diagnosticUpdater The diagnostic updater to use.
     * @param {CodeActionEditResolver} codeActionEditResolver The code action edit resolver to use.
     * @param {DocumentFormatter} documentFormatter The document formatter to use.
     */
    public constructor(
        configuration: Configuration,
        diagnosticUpdater: DiagnosticUpdater,
        codeActionEditResolver: CodeActionEditResolver,
        documentFormatter: DocumentFormatter
    ) {
        this.configuration = configuration;
        this.diagnosticUpdater = diagnosticUpdater;
        this.codeActionEditResolver = codeActionEditResolver;
        this.documentFormatter = documentFormatter;
        this.documents = new Map();
        this.updateDebounceMap = new Map();
        this.subscriptions = [];
    }

    /**
     * Disposes of the class' resources.
     */
    public dispose(): void {
        for (const kvp of this.updateDebounceMap) {
            clearTimeout(kvp[1]);
        }
        this.updateDebounceMap.clear();

        for (const sub of this.subscriptions) {
            sub.dispose();
        }
        this.subscriptions.splice(0, this.subscriptions.length);
    }

    /**
     * Starts listening to events.
     *
     * @param {workspace} workspace The VS Code workspace to start listening on.
     * @param {window} window The VS Code window.
     */
    public start(workspace: typeof vsCodeWorkspace, window: typeof vsCodeWindow): void {
        // The opening and closing of documents will dictate whether we're listening for updates or not.
        this.subscriptions.push(workspace.onDidOpenTextDocument((e) => this.onOpen(e)));
        this.subscriptions.push(workspace.onDidCloseTextDocument((e) => this.onClose(e)));

        // When the text document's content is changed we should update the diagnostics as they're likely invalid.
        this.subscriptions.push(workspace.onDidChangeTextDocument((e) => {
            if (e.contentChanges.length < 1) {
                return;
            }

            this.onUpdate(e.document);
        }));

        // When the configuration changes we need to invalidate all of the documents
        // since it may have affected the output of our commands.
        this.subscriptions.push(workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('phpCodeSniffer')) {
                return;
            }

            this.updateAllDocuments();
        }));

        // Make sure that the current editor is considered open.
        if (window.activeTextEditor) {
            this.onOpen(window.activeTextEditor.document);
        }

        // We're going to be watching for filesystem events on PHPCS executables.
        // This will allow us to take action when an executable we're using is no
        // longer available as well as when a new executable becomes available.
        const watcher = workspace.createFileSystemWatcher('**/bin/phpcs', false, true, false);
        this.subscriptions.push(watcher);
        watcher.onDidCreate((e) => this.onExecutableChange(workspace, e));
        watcher.onDidDelete((e) => this.onExecutableChange(workspace, e));
    }

    /**
     * A callback for documents being opened.
     *
     * @param {TextDocument} document The affected document.
     */
    private onOpen(document: TextDocument): void {
        // We only care about PHP documents.
        if (document.languageId !== 'php') {
            return;
        }
        this.documents.set(document.uri, document);

        // Trigger an update so that the document will gather diagnostics.
        this.onUpdate(document);
    }

    /**
     * A callback for documents being closed.
     *
     * @param {TextDocument} document The affected document.
     */
    private onClose(document: TextDocument): void {
        // If we're tracking the document we should clean up after it.
        if (!this.documents.has(document.uri)) {
            return;
        }
        this.documents.delete(document.uri);

        // Let all of our services know the document is gone.
        this.diagnosticUpdater.onDocumentClosed(document);
        this.codeActionEditResolver.onDocumentClosed(document);
        this.documentFormatter.onDocumentClosed(document);

        // Don't unnecessarily hold onto the cache.
        this.configuration.clearCache(document);
    }

    /**
     * A callback for documents being changed.
     *
     * @param {TextDocument} document The affected document.
     */
    private onUpdate(document: TextDocument): void {
        // Don't update documents that we aren't tracking.
        if (!this.documents.has(document.uri)) {
            return;
        }
        this.documents.set(document.uri, document);

        // Apply a debounce so that we don't perform the update too quickly.
        let debounce = this.updateDebounceMap.get(document.uri);
        if (debounce) {
            clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
            this.updateDebounceMap.delete(document.uri);

            // Don't allow for overlapping requests for the same document.
            this.diagnosticUpdater.cancel(document);

            // Update the diagnostics for the document.
            this.diagnosticUpdater.update(document);
        }, 100);
        this.updateDebounceMap.set(document.uri, debounce);
    }

    /**
     * A callback for `bin/phpcs` executables being created or deleted.
     *
     * @param {workspace} workspace The workspace the executable is part of.
     * @param {Uri} executable The Uri for the executable that has changed.
     */
    private onExecutableChange(workspace: typeof vsCodeWorkspace, executable: Uri): void {
        const workspaceFolder = workspace.getWorkspaceFolder(executable);
        if (!workspaceFolder) {
            throw new Error('No workspace found for executable.');
        }

        const folderString = workspaceFolder.uri.toString();

        // Since the cache may be invalid now we should update all of the documents
        // that might be affected by this change.
        for (const kvp of this.documents) {
            // Only affect documents in the workspace folder.
            const documentString = kvp[0].toString();
            if (!documentString.startsWith(folderString)) {
                continue;
            }

            // Clear the cache since its executable may have been affected.
            this.configuration.clearCache(kvp[1]);

            // Don't allow for overlapping requests.
            this.diagnosticUpdater.cancel(kvp[1]);

            // Update the diagnostics for the document.
            this.diagnosticUpdater.update(kvp[1]);
        }
    }

    /**
     * Generates new data for all of the documents that we're tracking.
     */
    private updateAllDocuments(): void {
        // Clear the cache so that configuration updates will be pulled in.
        this.configuration.clearCache();

        for (const kvp of this.documents) {
            // Don't allow for overlapping requests.
            this.diagnosticUpdater.cancel(kvp[1]);

            // Update the diagnostics for the document.
            this.diagnosticUpdater.update(kvp[1]);
        }
    }
}
