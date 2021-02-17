import {
    CancellationToken,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    FormattingOptions,
    ProviderResult,
    Range,
    TextDocument,
    TextEdit
} from 'vscode';
import { DiagnosticUpdater } from '../services/diagnostic-updater';
import { DocumentFormatter } from '../services/document-formatter';

/**
 * A class for providing document formatting requests.
 */
export class FormatDocumentProvider implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {
    /**
     * The formatter that we will use.
     */
    private readonly documentFormatter: DocumentFormatter;

    /**
     * The diagnostic updater we will use.
     */
    private readonly diagnosticUpdater: DiagnosticUpdater;

    /**
     * Constructor.
     *
     * @param {DocumentFormatter} documentFormatter The formatter to use.
     * @param {DiagnosticUpdater} diagnosticUpdater The diagnostic updater to use.
     */
    public constructor(documentFormatter: DocumentFormatter, diagnosticUpdater: DiagnosticUpdater) {
        this.documentFormatter = documentFormatter;
        this.diagnosticUpdater = diagnosticUpdater;
    }

    /**
     * Provides document formatting edits.
     *
     * @param {TextDocument} document The document to provide edits for.
     * @param {FormattingOptions} options The options for the request.
     * @param {CancellationToken} cancellationToken The cancellation token for the request.
     */
    public provideDocumentFormattingEdits(
        document: TextDocument,
        options: FormattingOptions,
        cancellationToken: CancellationToken
    ): ProviderResult<TextEdit[]> {
        return this.provideDocumentRangeFormattingEdits(document, null, options, cancellationToken);
    }

    /**
     * Provides document range formatting edits.
     *
     * @param {TextDocument} document The document to provide edits for.
     * @param {Range|null} range The optional range for to provide edits for.
     * @param {FormattingOptions} options The options for the request.
     * @param {CancellationToken} cancellationToken The cancellation token for the request.
     */
    public provideDocumentRangeFormattingEdits(
        document: TextDocument,
        range: Range|null,
        _options: FormattingOptions,
        cancellationToken: CancellationToken
    ): ProviderResult<TextEdit[]> {
        return this.documentFormatter.format(document, range, cancellationToken)
            .then((edit) => {
                // Clear any of the diagnostics for the document since we've formatted it and will re-scan.
                this.diagnosticUpdater.clearDocument(document);

                return edit;
            });
    }
}
