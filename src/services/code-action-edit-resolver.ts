import { CancellationToken, Diagnostic, TextDocument, WorkspaceEdit } from 'vscode';
import { CodeAction } from '../code-action';
import { Request } from '../phpcs-report/request';
import { ReportType, Response } from '../phpcs-report/response';
import { Worker } from '../phpcs-report/worker';
import { WorkerService } from './worker-service'

type CompletionCallback = (edit?: WorkspaceEdit) => void;

/**
 * A class for resolving edits for code actions.
 */
export class CodeActionEditResolver extends WorkerService {
    /**
     * Resolves a code action's edit property.
     *
     * @param {CodeAction} codeAction The code action that we're going to resolve.
     * @param {Function} onComplete A callback to receive the edit once it has resolved.
     * @param {CancellationToken} [cancellationToken] The optional cancellation token to add.
     */
    public resolve(
        codeAction: CodeAction,
        onComplete: CompletionCallback,
        cancellationToken?: CancellationToken
    ): void {
        // We can't resolve the code action if it isn't valid.
        if (!codeAction.document || !codeAction.diagnostics || codeAction.diagnostics.length != 1) {
            onComplete(undefined);
            return;
        }

        // Use a consistent key to prevent overlap when resolving the code action.
        const diagnostic = codeAction.diagnostics[0];
        const workerKey = [
            'resolve',
            codeAction.document.fileName,
            (diagnostic.code as string),
            diagnostic.range.start.line,
            diagnostic.range.start.character
        ].join(':');

        const started = this.startWorker(
            codeAction.document,
            workerKey,
            (worker, cancellationToken) => this.onWorkerAvailable(
                codeAction.document as TextDocument,
                onComplete,
                diagnostic,
                worker,
                cancellationToken
            ),
            cancellationToken
        );
        if (!started) {
            onComplete(undefined);
        }
    }

    /**
     * A callback triggered once a worker from the pool becomes available for us to use.
     *
     * @param {TextDocument} document The document to resolve.
     * @param {Function} onComplete The completion callback.
     * @param {Diagnostic} diagnostic The diagnostic from the code action we're resolving.
     * @param {Worker} worker The worker to execute the request.
     * @param {CancellationToken} [cancellationTokenSource] The cancellation token to stop the request,.
     */
    private onWorkerAvailable(
        document: TextDocument,
        onComplete: CompletionCallback,
        diagnostic: Diagnostic,
        worker: Worker,
        cancellationToken?: CancellationToken
    ): void {
        const config = this.configuration.get(document);

        // Use the worker to make a request for a code action report.
        const request: Request<ReportType.CodeAction> = {
            type: ReportType.CodeAction,
            documentContent: document.getText(),
            options: {
                workingDirectory: config.workingDirectory,
                executable: config.executable,
                standard: config.standard
            },
            data: {
                code: diagnostic.code as string,
                line: diagnostic.range.start.line,
                character: diagnostic.range.start.character
            },
            onComplete: (response) => this.onReportCompleted(document, onComplete, response)
        };

        worker.execute(request, cancellationToken);
    }

    /**
     * A callback triggered once a worker has completed the code action report.
     *
     * @param {TextDocument} document The document to resolve.
     * @param {Function} onComplete The completion callback.
     * @param {Response} response The response from the worker.
     */
    private onReportCompleted(
        document: TextDocument,
        onComplete: CompletionCallback,
        response: Response<ReportType.CodeAction>
    ): void {
        // Clean up after the execution.
        this.onWorkerFinished(document);

        if (!response.report) {
            onComplete();
            return;
        }

        // Pass the workspace edit to the requester.
        const edit = new WorkspaceEdit();
        edit.set(document.uri, response.report.edits);
        onComplete(edit);
    }
}
