import { CancellationToken, CancellationTokenSource, Disposable, TextDocument, Uri } from 'vscode';
import { Configuration } from '../configuration';
import { AvailableWorkerCallback, WorkerPool } from '../phpcs-report/worker-pool';

/**
 * A base class for all of the updates that interact with PHPCS.
 */
export abstract class WorkerService implements Disposable {
    /**
     * The configuration object.
     */
    protected readonly configuration: Configuration;

    /**
     * The pool of workers for making report requests.
     */
    protected readonly workerPool: WorkerPool;

    /**
     * A map containing all of the cancellation token sources to prevent overlapping execution.
     */
    private readonly cancellationTokenSourceMap: Map<Uri, CancellationTokenSource>;

    /**
     * Constructor.
     *
     * @param {Configuration} configuration The configuration object to use.
     * @param {WorkerPool} workerPool The worker pool to use.
     */
    public constructor(configuration: Configuration, workerPool: WorkerPool) {
        this.configuration = configuration;
        this.workerPool = workerPool;
        this.cancellationTokenSourceMap = new Map();
    }

     /**
     * Disposes of the services's resources.
     */
    public dispose(): void {
        for (const kvp of this.cancellationTokenSourceMap) {
            kvp[1].dispose();
        }
        this.cancellationTokenSourceMap.clear();
    }

    /**
     * Cancels an in-progress update for the document if one is taking place.
     *
     * @param {TextDocument} document The document to cancel.
     */
    public cancel(document: TextDocument): void {
        const cancellationTokenSource = this.cancellationTokenSourceMap.get(document.uri);
        if (cancellationTokenSource) {
            cancellationTokenSource.cancel();
            cancellationTokenSource.dispose();
            this.cancellationTokenSourceMap.delete(document.uri);
        }
    }

    /**
     * A handler to be called when a document is closed to clean up after it.
     *
     * @param {TextDocument} document The document that was closed.
     */
    public onDocumentClosed(document: TextDocument): void {
        // Stop any executing tasks.
        this.cancel(document);
    }

    /**
     * Starts a worker for the given document.
     *
     * @param {TextDocument} document The document to start working on.
     * @param {string} workerKey The unique key to identify this worker request.
     * @param {AvailableWorkerCallback} callback A callback to execute once the worker is available.
     * @param {CancellationToken} [cancellationToken] An optional cancellation token to use.
     */
    protected startWorker(
        document: TextDocument,
        workerKey: string,
        callback: AvailableWorkerCallback,
        cancellationToken?: CancellationToken
    ): boolean {
        // We want to prevent overlapping execution.
        if (this.cancellationTokenSourceMap.has(document.uri)) {
            return false;
        }

        // Store the token so that we can cancel if necessary.
        // @ts-ignore: The definition is wrong; the token source accepts a parent token.
        const cancellationTokenSource = new CancellationTokenSource(cancellationToken);
        this.cancellationTokenSourceMap.set(document.uri, cancellationTokenSource);

        // On cancellation we should remove the existing token.
        cancellationTokenSource.token.onCancellationRequested(() => {
            this.cancellationTokenSourceMap.delete(document.uri);
        });

        // Place this document in the queue for a worker to generate the report.
        this.workerPool.waitForAvailable(
            workerKey,
            (worker, cancellationToken) => callback(worker, cancellationToken),
            cancellationTokenSource.token
        );
        return true;
    }

    /**
     * A callback for use once the worker has completed execution.
     *
     * @param {TextDocument} document The document we've finished working on.
     */
    protected onWorkerFinished(document: TextDocument): void {
        const cancellationTokenSource = this.cancellationTokenSourceMap.get(document.uri);
        if (cancellationTokenSource) {
            cancellationTokenSource.dispose();
            this.cancellationTokenSourceMap.delete(document.uri);
        }
    }
}
