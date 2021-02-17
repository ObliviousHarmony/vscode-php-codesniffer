import { CancellationToken, Range, TextDocument, TextEdit } from 'vscode';
import { FormatRequest, Request } from '../phpcs-report/request';
import { ReportType } from '../phpcs-report/response';
import { WorkerService } from './worker-service'

/**
 * A class for formatting documents and document ranges.
 */
export class DocumentFormatter extends WorkerService {
    /**
     * Resolves a code action's edit property.
     *
     * @param {TextDocument} document The document we want to resolve the code action for.
     * @param {CodeAction} codeAction The code action that we're going to resolve.
     * @param {CancellationToken} [parentCancellationToken] The optional cancellation token to use.
     */
    public format(
        document: TextDocument,
        range: Range|null,
        parentCancellationToken?: CancellationToken
    ): Promise<TextEdit[]> {
        const cancellationToken = this.createCancellationToken(document, parentCancellationToken);
        if (!cancellationToken) {
            return Promise.resolve([]);
        }

        // Use a consistent key to prevent overlap when resolving the code action.
        const workerKey = [
            'format',
            document.fileName,
        ].join(':');

        return this.workerPool.waitForAvailable(workerKey, cancellationToken)
            .then((worker) => {
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
                    data: data
                };

                return worker.execute(request, cancellationToken);
            })
            .then((response) => {
                this.deleteCancellationToken(document);

                // Transform the content into a document-wide edit.
                const edits: TextEdit[] = [];
                if (response.report) {
                    edits.push(new TextEdit(
                        new Range(0, 0, document.lineCount, 0),
                        response.report.content
                    ));
                }

                return edits;
            });
    }
}
