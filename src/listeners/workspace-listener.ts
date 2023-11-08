import {
	Disposable,
	TextDocument,
	Uri,
	window as vsCodeWindow,
	workspace as vsCodeWorkspace,
} from 'vscode';
import {
	Configuration,
	LintAction,
	AutomaticCodingStandardFilenames,
} from '../services/configuration';
import { CodeActionEditResolver } from '../services/code-action-edit-resolver';
import { DiagnosticUpdater } from '../services/diagnostic-updater';
import { DocumentFormatter } from '../services/document-formatter';
import { UriMap } from '../common/uri-map';
import { UriSet } from '../common/uri-set';

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
	 * A set containing the Uris of all the documents that we're tracking.
	 */
	private readonly trackedDocuments: UriSet;

	/**
	 * A map for applying a debounce to document updates.
	 */
	private readonly updateDebounceMap: UriMap<NodeJS.Timeout>;

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
		this.trackedDocuments = new UriSet();
		this.updateDebounceMap = new UriMap();
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
	public start(
		workspace: typeof vsCodeWorkspace,
		window: typeof vsCodeWindow
	): void {
		// The opening and closing of documents will dictate whether we're listening for updates or not.
		this.subscriptions.push(
			workspace.onDidOpenTextDocument((e) => this.onDocumentOpen(e))
		);
		this.subscriptions.push(
			workspace.onDidCloseTextDocument((e) => this.onDocumentClose(e))
		);

		// When the text document's content is changed we should update the diagnostics as they're likely invalid.
		this.subscriptions.push(
			workspace.onDidChangeTextDocument((e) => {
				if (e.contentChanges.length < 1) {
					return;
				}

				this.onDocumentChange(e.document);
			})
		);

		// When the text document is saved we should update the diagnostics.
		this.subscriptions.push(
			workspace.onDidSaveTextDocument((e) => {
				this.onDocumentSave(e);
			})
		);

		// When the configuration changes we need to invalidate all of the documents
		// since it may have affected the output of our commands.
		this.subscriptions.push(
			workspace.onDidChangeConfiguration((e) => {
				if (!e.affectsConfiguration('phpCodeSniffer')) {
					return;
				}

				this.updateAllDocuments(workspace);
			})
		);

		// Make sure that the current editor is considered open.
		if (window.activeTextEditor) {
			this.onDocumentOpen(window.activeTextEditor.document);
		}

		// We're going to be watching for filesystem events on PHPCS executables.
		// This will allow us to take action when an executable we're using is no
		// longer available as well as when a new executable becomes available.
		let watcher = workspace.createFileSystemWatcher(
			'**/bin/phpcs',
			false,
			true,
			false
		);
		this.subscriptions.push(watcher);
		watcher.onDidCreate((e) => this.onExecutableChange(workspace, e));
		watcher.onDidDelete((e) => this.onExecutableChange(workspace, e));

		// We're also going to be watching for filesystem events on coding standard
		// files. This will allow us to take action when the coding standard may
		// no longer apply and needs to be re-evaluated.
		const codingStandardFilenameGlob =
			AutomaticCodingStandardFilenames.join(',');
		watcher = workspace.createFileSystemWatcher(
			'**/{' + codingStandardFilenameGlob + '}'
		);
		this.subscriptions.push(watcher);
		watcher.onDidCreate((e) =>
			this.onCodingStandardFileChange(workspace, e)
		);
		watcher.onDidChange((e) =>
			this.onCodingStandardFileChange(workspace, e)
		);
		watcher.onDidDelete((e) =>
			this.onCodingStandardFileChange(workspace, e)
		);
	}

	/**
	 * A callback for documents being opened.
	 *
	 * @param {TextDocument} document The affected document.
	 */
	private onDocumentOpen(document: TextDocument): void {
		// We only care about files with schemes we are able to handle.
		switch (document.uri.scheme) {
			case 'file':
			case 'untitled':
				break;

			default:
				return;
		}

		// We only care about PHP documents.
		if (document.languageId !== 'php') {
			return;
		}

		// Mark that we should be tracking the document.
		this.trackedDocuments.add(document.uri);

		// Update the diagnostics for the document.
		this.diagnosticUpdater.update(document, LintAction.Force);
	}

	/**
	 * A callback for documents being closed.
	 *
	 * @param {TextDocument} document The affected document.
	 */
	private onDocumentClose(document: TextDocument): void {
		// Only clean up after documents that we're tracking.
		if (!this.trackedDocuments.delete(document.uri)) {
			return;
		}

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
	private onDocumentChange(document: TextDocument): void {
		// Don't update documents that we aren't tracking.
		if (!this.trackedDocuments.has(document.uri)) {
			return;
		}

		// Since a document can change very quickly while typing, we should
		// apply a debounce to avoid unnecessary work.
		let debounce = this.updateDebounceMap.get(document.uri);
		if (debounce) {
			clearTimeout(debounce);
		}

		// Make sure to track the timer so we can cancel it if needed.
		debounce = setTimeout(() => {
			this.updateDebounceMap.delete(document.uri);

			// Don't allow for overlapping requests for the same document.
			this.diagnosticUpdater.cancel(document);

			// Update the diagnostics for the document.
			this.diagnosticUpdater.update(document, LintAction.Change);
		}, 200);
		this.updateDebounceMap.set(document.uri, debounce);
	}

	/**
	 * A callback for documents being saved.
	 *
	 * @param {TextDocument} document The affected document.
	 */
	private onDocumentSave(document: TextDocument): void {
		// Don't update documents that we aren't tracking.
		if (!this.trackedDocuments.has(document.uri)) {
			return;
		}

		// Don't allow for overlapping requests for the same document.
		this.diagnosticUpdater.cancel(document);

		// Update the diagnostics for the document.
		this.diagnosticUpdater.update(document, LintAction.Save);
	}

	/**
	 * A callback for `bin/phpcs` executables being created or deleted.
	 *
	 * @param {workspace} workspace The workspace the executable is part of.
	 * @param {Uri} executable The Uri for the executable that has changed.
	 */
	private onExecutableChange(
		workspace: typeof vsCodeWorkspace,
		executable: Uri
	): void {
		const workspaceFolder = workspace.getWorkspaceFolder(executable);
		if (!workspaceFolder) {
			throw new Error('No workspace found for executable.');
		}

		const folderString = workspaceFolder.uri.toString();

		// Since the cache may be invalid now we should update all of the documents
		// that might be affected by this change.
		for (const document of workspace.textDocuments) {
			// Only update documents we're tracking.
			if (!this.trackedDocuments.has(document.uri)) {
				continue;
			}

			// Only affect documents in the workspace folder.
			const documentString = document.uri.toString();
			if (!documentString.startsWith(folderString)) {
				continue;
			}

			// Clear the cache since its executable may have been affected.
			this.configuration.clearCache(document);

			// Don't allow for overlapping requests.
			this.diagnosticUpdater.cancel(document);

			// Since the output from the worker may have changed we should clear the potentially invalid diagnostics.
			this.diagnosticUpdater.clearDocument(document);

			// Update the diagnostics for the document.
			this.diagnosticUpdater.update(document, LintAction.Force);
		}
	}

	/**
	 * A callback for  executables being created or deleted.
	 *
	 * @param {workspace} workspace The workspace the file is part of.
	 * @param {Uri} codingStandard The Uri for the coding standard that has changed.
	 */
	private onCodingStandardFileChange(
		workspace: typeof vsCodeWorkspace,
		codingStandard: Uri
	): void {
		const workspaceFolder = workspace.getWorkspaceFolder(codingStandard);
		if (!workspaceFolder) {
			throw new Error('No workspace found for coding standard.');
		}

		const folderString = workspaceFolder.uri.toString();

		// Since the cache may be invalid now we should update all of the documents
		// that might be affected by this change.
		for (const document of workspace.textDocuments) {
			// Only update documents we're tracking.
			if (!this.trackedDocuments.has(document.uri)) {
				continue;
			}

			// Only affect documents in the workspace folder.
			const documentString = document.uri.toString();
			if (!documentString.startsWith(folderString)) {
				continue;
			}

			// Clear the cache since its executable may have been affected.
			this.configuration.clearCache(document);

			// Don't allow for overlapping requests.
			this.diagnosticUpdater.cancel(document);

			// Since the output from the worker may have changed we should clear the potentially invalid diagnostics.
			this.diagnosticUpdater.clearDocument(document);

			// Update the diagnostics for the document.
			this.diagnosticUpdater.update(document, LintAction.Force);
		}
	}

	/**
	 * Generates new data for all of the documents that we're tracking.
	 *
	 * @param {workspace} workspace The workspace to update all of the documents in.
	 */
	private updateAllDocuments(workspace: typeof vsCodeWorkspace): void {
		// Clear the cache so that configuration updates will be pulled in.
		this.configuration.clearCache();

		for (const document of workspace.textDocuments) {
			// Only update documents that we're tracking.
			if (!this.trackedDocuments.has(document.uri)) {
				continue;
			}

			// Don't allow for overlapping requests.
			this.diagnosticUpdater.cancel(document);

			// Since the output from the worker may have changed we should clear the potentially invalid diagnostics.
			this.diagnosticUpdater.clearDocument(document);

			// Update the diagnostics for the document.
			this.diagnosticUpdater.update(document, LintAction.Force);
		}
	}
}
