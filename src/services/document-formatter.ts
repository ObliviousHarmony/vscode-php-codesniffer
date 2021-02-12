import { CancellationToken, Range, TextDocument, TextEdit } from 'vscode';
import { FormatRequest, Request } from '../phpcs-report/request';
import { ReportType, Response } from '../phpcs-report/response';
import { Worker } from '../phpcs-report/worker';
import { WorkerService } from './worker-service'

type CompletionCallback = (edit?: TextEdit) => void;

/**
 * A class for formatting documents and document ranges.
 */
export class DocumentFormatter extends WorkerService {
    /**
     * Resolves a code action's edit property.
     *
     * @param {TextDocument} document The document we want to resolve the code action for.
     * @param {CodeAction} codeAction The code action that we're going to resolve.
     * @param {Function} onComplete A callback to receive the edit once it has resolved.
     * @param {CancellationToken} [cancellationToken] The optional cancellation token to add.
     */
    public format(
        document: TextDocument,
        range: Range|null,
        onComplete: CompletionCallback,
        cancellationToken?: CancellationToken
    ): void {
        // Use a consistent key to prevent overlap when resolving the code action.
        const workerKey = [
            'format',
            document.fileName,
        ].join(':');

        const started = this.startWorker(
            document,
            workerKey,
            (worker, cancellationToken) => this.onWorkerAvailable(document, range, onComplete, worker, cancellationToken),
            cancellationToken
        );
        if (!started) {
            onComplete(undefined);
        }
    }

    /**
     * A callback triggered once a worker from the pool becomes available for us to use.
     *
     * @param {TextDocument} document The document to format.
     * @param {Range|null} range The optional range of the document to format.
     * @param {Function} onComplete The completion callback.
     * @param {Worker} worker The worker to execute the request.
     * @param {CancellationToken} [cancellationTokenSource] The cancellation token to stop the request,.
     */
    private onWorkerAvailable(
        document: TextDocument,
        range: Range|null,
        onComplete: CompletionCallback,
        worker: Worker,
        cancellationToken?: CancellationToken
    ): void {
        const config = this.configuration.get(document);

        const data: FormatRequest = {};

        if (range) {
            data.start = { line: range.start.line, character: range.start.character };
            data.end = { line: range.end.line, character: range.end.character };
        }

        // Use the worker to make a request for a format report.
        const request: Request<ReportType.Format> = {
            type: ReportType.Format,
            documentContent: document.getText(),
            options: {
                workingDirectory: config.workingDirectory,
                executable: config.executable,
                standard: config.standard
            },
            data: data,
            onComplete: (response) => this.onReportCompleted(document, onComplete, response)
        };

        worker.execute(request, cancellationToken);
    }

    /**
     * A callback triggered once a worker has completed the code action report.
     *
     * @param {TextDocument} document The document to update.
     * @param {Function} onComplete The completion callback.
     * @param {Response} response The response from the worker.
     */
    private onReportCompleted(
        document: TextDocument,
        onComplete: CompletionCallback,
        response: Response<ReportType.Format>
    ): void {
        // Clean up after the execution.
        this.onWorkerFinished(document);

        // Transform the content into a document-wide edit.
        let edit: TextEdit|undefined;
        if (response.report) {
            edit = new TextEdit(
                new Range(0, 0, document.lineCount, 0),
                response.report.content
            );
        }

        onComplete(edit);
    }
}
