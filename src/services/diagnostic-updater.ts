import { CancellationToken, DiagnosticCollection, TextDocument } from 'vscode';
import { CodeActionCollection } from '../code-action';
import { Configuration } from '../configuration';
import { Request } from '../phpcs-report/request';
import { ReportType, Response } from '../phpcs-report/response';
import { Worker } from '../phpcs-report/worker';
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
     * @param {Configuration} configuration The configuration object to use.
     * @param {WorkerPool} workerPool The worker pool to use.
     * @param {DiagnosticCollection} diagnosticCollection The collection of diagnostics we are responsible for.
     * @param {CodeActionCollection} codeActionCollection The collection of code actions that we're responsible for.
     */
    public constructor(
        configuration: Configuration,
        workerPool: WorkerPool,
        diagnosticCollection: DiagnosticCollection,
        codeActionCollection: CodeActionCollection
    ) {
        super(configuration, workerPool);

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
        this.startWorker(
            document,
            'diagnostic:' + document.fileName,
            (worker, cancellationToken) => this.onWorkerAvailable(document, worker, cancellationToken)
        );
    }

    /**
     * A callback triggered once a worker from the pool becomes available for us to use.
     *
     * @param {TextDocument} document The document to update.
     * @param {Worker} worker The worker to execute the request.
     * @param {CancellationToken} [cancellationTokenSource] The cancellation token to stop the request,.
     */
    private onWorkerAvailable(document: TextDocument, worker: Worker, cancellationToken?: CancellationToken): void {
        const config = this.configuration.get(document);

        // Use the worker to make a request for a diagnostic report.
        const request: Request<ReportType.Diagnostic> = {
            type: ReportType.Diagnostic,
            documentContent: document.getText(),
            options: {
                workingDirectory: config.workingDirectory,
                executable: config.executable,
                standard: config.standard
            },
            data: null,
            onComplete: (response) => this.onReportCompleted(document, response)
        };

        worker.execute(request, cancellationToken);
    }

    /**
     * A callback triggered once a worker has completed the diagnostic report.
     *
     * @param {TextDocument} document The document to update.
     * @param {Response} response The response from the worker.
     */
    private onReportCompleted(document: TextDocument, response: Response<ReportType.Diagnostic>): void {
        // Clean up after the execution.
        this.onWorkerFinished(document);

        // When an empty response is received it means that there are no diagnostics for the file.
        if (!response.report) {
            this.diagnosticCollection.delete(document.uri);
            this.codeActionCollection.delete(document.uri);
            return;
        }

        // Update the document with the information returned by our report.
        this.diagnosticCollection.set(document.uri, response.report.diagnostics);
        this.codeActionCollection.set(document.uri, response.report.codeActions);
    }
}
