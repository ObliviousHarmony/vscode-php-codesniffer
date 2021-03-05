import { CodeActionKind, Diagnostic, DiagnosticSeverity, Range, TextEdit } from 'vscode';
import { CodeAction } from '../types';

/**
 * The type of PHPCS report that a request should fetch.
 */
export enum ReportType {
    Diagnostic,
    CodeAction,
    Format,
}

/**
 * The "Diagnostic" report type from PHPCS.
 */
interface DiagnosticReport {
    diagnostics: Diagnostic[];
    codeActions: CodeAction[];
}

/**
 * The "CodeAction" report type from PHPCS.
 */
interface CodeActionReport {
    edits: TextEdit[];
}

/**
 * The "Format" report type from PHPCS.
 */
interface FormatReport {
    content: string;
}

/**
 * A type utility for providing safety to responses based on the type of report they are for.
 */
type ReportContent<T extends ReportType> = [T] extends [ReportType.Diagnostic] ? DiagnosticReport :
    [T] extends [ReportType.CodeAction] ? CodeActionReport :
    [T] extends [ReportType.Format] ? FormatReport :
    never;

/**
 * The response from the worker containing the requested report.
 */
export class Response<T extends ReportType> {
    public readonly type: T;
    public readonly report?: ReportContent<T>;

    /**
     * Constructor.
     *
     * @param {ReportType} type The type of report in the response.
     * @param {ReportContent} [report] The requested report if one was returned.
     */
    private constructor(type: T, report?: ReportContent<T>) {
        this.type = type;
        this.report = report;
    }

    /**
     * Transforms a raw report into a response object for consumption.
     *
     * @param {ReportType} type The type of report that the response contains.
     * @param {string} rawReport The raw report output from PHPCS.
     */
    public static fromRaw<T extends ReportType>(type: T, rawReport: string): Response<T> {
        if (rawReport.length <= 0) {
            return new Response(type);
        }
        const jsonReport = JSON.parse(rawReport);

        if (type === ReportType.Diagnostic) {
            const report: DiagnosticReport = {
                diagnostics: [],
                codeActions: []
            };

            for (const file of jsonReport.files) {
                // We're going to transform the diagnostics and code actions into real objects.
                // We should take care with the diagnostics to preserve their indexing so
                // that we can link the code actions to the diagnostics correctly.

                for (const rawDiagnostic of file.diagnostics) {
                    const range = new Range(
                        rawDiagnostic.range.startLine,
                        rawDiagnostic.range.startCharacter,
                        rawDiagnostic.range.endLine,
                        rawDiagnostic.range.endCharacter
                    );

                    // Sanitize the severity.
                    let severity: DiagnosticSeverity;
                    switch (rawDiagnostic.severity) {
                        case 0:
                            severity = DiagnosticSeverity.Error;
                            break;
                        case 1:
                            severity = DiagnosticSeverity.Warning;
                            break;

                        default:
                            continue;
                    }

                    const diagnostic = new Diagnostic(range, rawDiagnostic.message, severity);
                    diagnostic.code = rawDiagnostic.code;
                    diagnostic.source = rawDiagnostic.source;
                    diagnostic.relatedInformation = [];
                    report.diagnostics.push(diagnostic);
                }

                for (const rawAction of file.codeActions) {
                    // Transform the kind into its associated structure.
                    let kind: CodeActionKind;
                    switch (rawAction.kind) {
                        case 'quickfix':
                            kind = CodeActionKind.QuickFix;
                            break;

                        default:
                            continue;
                    }

                    const diagnostic = report.diagnostics[rawAction.diagnostic];

                    const codeAction = new CodeAction(rawAction.title, kind);
                    codeAction.diagnostics = [ diagnostic ];
                    codeAction.isPreferred = true;
                    report.codeActions.push(codeAction);
                }
            }

            return new Response(type, report as ReportContent<ReportType>);
        }

        if (type === ReportType.CodeAction) {
            const report: CodeActionReport = {
                edits: []
            };

            // Transform all of the edits into real objects.
            for (const file of jsonReport.files) {
                for (const textEdit of file.textEdits) {
                    const range = new Range(
                        textEdit.range.startLine,
                        textEdit.range.startCharacter,
                        textEdit.range.endLine,
                        textEdit.range.endCharacter
                    );

                    report.edits.push(new TextEdit(range, textEdit.newContent));
                }
            }

            return new Response(type, report as ReportContent<ReportType>);
        }

        if (type === ReportType.Format) {
            const report: FormatReport = {
                content: ''
            };

            // Transform all of the edits into real objects.
            for (const file of jsonReport.files) {
                report.content = file.content;
            }

            return new Response(type, report as ReportContent<ReportType>);
        }

        throw new Error(`An invalid report type of "${type}" was used.`);
    }

    /**
     * Generates an empty response of a given report type.
     *
     * @param {ReportType} type The type of report that the response contains.
     */
    public static empty<T extends ReportType>(type: T): Response<T> {
        return new Response(type);
    }
}
