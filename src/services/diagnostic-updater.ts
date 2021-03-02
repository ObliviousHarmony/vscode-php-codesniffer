import { CancellationError, DiagnosticCollection, TextDocument } from 'vscode';
import { CodeActionCollection } from '../code-action';
import { Configuration } from '../configuration';
import { Logger } from '../logger';
import { Request } from '../phpcs-report/request';
import { ReportType } from '../phpcs-report/response';
import { PHPCSError } from '../phpcs-report/worker';
import { WorkerPool } from '../phpcs-report/worker-pool';
import { WorkerService } from './worker-service';

/**
 * A class for updating diagnostics and code actions.
 */
export class DiagnosticUpdater extends WorkerService {
    /**
     * A collection of all the diagnostics we are responsible for.
     */
    private readonly diagnosticCollection: DiagnosticCollection;

    /**
     * A map of all the code actions we are responsible for.
     */
    private readonly codeActionCollection: CodeActionCollection;

    /**
     * Constructor.
     *
     * @param {Logger} logger The logger to use.
     * @param {Configuration} configuration The configuration object to use.
     * @param {WorkerPool} workerPool The worker pool to use.
     * @param {DiagnosticCollection} diagnosticCollection The collection of diagnostics we are responsible for.
     * @param {CodeActionCollection} codeActionCollection The collection of code actions that we're responsible for.
     */
    public constructor(
        logger: Logger,
        configuration: Configuration,
        workerPool: WorkerPool,
        diagnosticCollection: DiagnosticCollection,
        codeActionCollection: CodeActionCollection
    ) {
        super(logger, configuration, workerPool);

        this.diagnosticCollection = diagnosticCollection;
        this.codeActionCollection = codeActionCollection;
    }

    /**
     * A handler to be called when a document is closed to clean up after it.
     *
     * @param {TextDocument} document The document that was closed.
     */
    public onDocumentClosed(document: TextDocument): void {
        super.onDocumentClosed(document);
        this.clearDocument(document);
    }

    /**
     * Clears the data stored for a document.
     *
     * @param {TextDocument} document The document to reset.
     */
    public clearDocument(document: TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
        this.codeActionCollection.delete(document.uri);
    }

    /**
     * Updates a document's diagnostics.
     *
     * @param {TextDocument} document The document to update the diagnostics for.
     */
    public update(document: TextDocument): void {
        const cancellationToken = this.createCancellationToken(document);
        if (!cancellationToken) {
            return;
        }

        this.workerPool.waitForAvailable('diagnostic:' + document.fileName, cancellationToken)
            .then(async (worker) => {
                const config = await this.configuration.get(document);

                // Use the worker to make a request for a diagnostic report.
                const request: Request<ReportType.Diagnostic> = {
                    type: ReportType.Diagnostic,
                    documentPath: document.uri.fsPath,
                    documentContent: document.getText(),
                    options: {
                        workingDirectory: config.workingDirectory,
                        executable: config.executable,
                        standard: config.standard
                    },
                    data: null
                };

                return worker.execute(request, cancellationToken);
            })
            .then((response) => {
                this.deleteCancellationToken(document);

                // When an empty response is received it means that there are no diagnostics for the file.
                if (!response.report) {
                    this.diagnosticCollection.delete(document.uri);
                    this.codeActionCollection.delete(document.uri);
                    return;
                }

                // Update the document with the information returned by our report.
                this.diagnosticCollection.set(document.uri, response.report.diagnostics);
                this.codeActionCollection.set(document.uri, response.report.codeActions);
            })
            .catch((e) => {
                // Cancellation errors are acceptable as they mean we've just repeated the update before it completed.
                if (e instanceof CancellationError) {
                    return;
                }

                // We should send PHPCS errors to be logged and presented to the user.
                if (e instanceof PHPCSError) {
                    this.logger.error(e);
                    return;
                }

                throw e;
            });
    }
}
