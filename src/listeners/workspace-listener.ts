import {
    Disposable,
    TextDocument,
    Uri,
    window as vsCodeWindow,
    workspace as vsCodeWorkspace
} from 'vscode';
import { Configuration } from '../configuration';
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
        // Listen to all of the document events that we care about.
        this.subscriptions.push(workspace.onDidOpenTextDocument((e) => this.onOpen(e)));
        this.subscriptions.push(workspace.onDidCloseTextDocument((e) => this.onClose(e)));
        this.subscriptions.push(workspace.onDidChangeTextDocument((e) => this.onUpdate(e.document)));
        this.subscriptions.push(workspace.onDidSaveTextDocument((e) => this.onUpdate(e)));

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

        this.diagnosticUpdater.onDocumentClosed(document);
        this.codeActionEditResolver.onDocumentClosed(document);
        this.documentFormatter.onDocumentClosed(document);
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
