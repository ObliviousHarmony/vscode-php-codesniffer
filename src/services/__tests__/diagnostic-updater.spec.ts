import { Diagnostic, DiagnosticCollection, workspace, Range, DiagnosticSeverity, CodeActionKind } from 'vscode';
import { CodeAction, CodeActionCollection } from '../../code-action';
import { Configuration, StandardType } from '../../configuration';
import { WorkerPool } from '../../phpcs-report/worker-pool';
import { DiagnosticUpdater } from '../diagnostic-updater';
import { MockDiagnosticCollection, MockTextDocument } from '../../__mocks__/vscode';
import { mocked } from 'ts-jest/utils';
import { Worker } from '../../phpcs-report/worker';
import { ReportType, Response } from '../../phpcs-report/response';

jest.mock('../../phpcs-report/report-files', () => {
    return {
        Dependencies: {
            VSCodeFile: 'VSCodeFile.php',
            VSCodeFixer: 'VSCodeFixer.php',
            VSCodeReport: 'VSCodeReport.php'
        },
        ReportFiles: {
            Diagnostic: 'Diagnostic.php',
            CodeAction: 'CodeAction.php',
            Format: 'Format.php'
        }
    };
});
jest.mock('../../configuration');
jest.mock('../../phpcs-report/worker');
jest.mock('../../phpcs-report/worker-pool');
jest.mock('../../code-action', () => {
    return {
        CodeAction: jest.fn().mockImplementation((title, kind) => {
            return { title, kind };
        }),
        CodeActionCollection: jest.fn().mockImplementation(() => {
            return {
                set: jest.fn(),
            };
        })
    };
});

describe('DiagnosticUpdater', () => {
    let mockConfiguration: Configuration;
    let mockWorkerPool: WorkerPool;
    let mockDiagnosticCollection: DiagnosticCollection;
    let mockCodeActionCollection: CodeActionCollection;
    let diagnosticUpdater: DiagnosticUpdater;

    beforeEach(() => {
        mockConfiguration = new Configuration(workspace);
        mockWorkerPool = new WorkerPool(1);
        mockDiagnosticCollection = new MockDiagnosticCollection();
        mockCodeActionCollection = new CodeActionCollection();

        diagnosticUpdater = new DiagnosticUpdater(
            mockConfiguration,
            mockWorkerPool,
            mockDiagnosticCollection,
            mockCodeActionCollection
        );
    });

    it('should update diagnostics and code actions', () => {
        const document = new MockTextDocument();
        document.fileName = 'test-document';

        const mockWorker = new Worker();
        mocked(mockWorkerPool).waitForAvailable.mockImplementation(
            (workerKey) => {
                expect(workerKey).toBe('diagnostic:test-document');
                return Promise.resolve(mockWorker);
            }
        )
        mocked(mockConfiguration).get.mockReturnValue(
            {
                workingDirectory: 'test-dir',
                executable: 'phpcs-test',
                standard: StandardType.PSR12
            }
        );
        mocked(mockWorker).execute.mockImplementation(
            (request) => {
                expect(request).toMatchObject(
                    {
                        type: ReportType.Diagnostic,
                        options: {
                            workingDirectory: 'test-dir',
                            executable: 'phpcs-test',
                            standard: StandardType.PSR12
                        }
                    }
                );

                const response: Response<ReportType.Diagnostic> = {
                    type: ReportType.Diagnostic,
                    report: {
                        diagnostics: [
                            new Diagnostic(new Range(0,1,2,3), 'Test', DiagnosticSeverity.Error)
                        ],
                        codeActions: [
                            new CodeAction('Test', CodeActionKind.QuickFix)
                        ]
                    }
                };

                return Promise.resolve(response);
            }
        );

        diagnosticUpdater.update(document);
    });
});
