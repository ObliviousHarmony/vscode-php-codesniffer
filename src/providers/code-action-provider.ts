import {
    CancellationToken,
    CodeActionContext,
    CodeActionKind,
    CodeActionProvider as BaseProvider,
    Diagnostic,
    ProviderResult,
    Range,
    TextDocument,
} from 'vscode';
import { CodeAction, CodeActionCollection } from '../code-action';
import { IgnoreLineCommand } from '../commands/ignore-line-command';
import { CodeActionEditResolver } from '../services/code-action-edit-resolver';

/**
 * A class for providing code actions.
 */
export class CodeActionProvider implements BaseProvider<CodeAction> {
    /**
     * The map containing any code actions that we've found.
     */
    private readonly codeActionCollection: CodeActionCollection;

    /**
     * The resolver for code actions.
     */
    private readonly codeActionEditResolver: CodeActionEditResolver;

    /**
     * Constructor.
     *
     * @param {CodeActionCollection} codeActionCollection The collection containing any code actions we've found.
     * @param {CodeActionEditResolver} codeActionEditResolver The resolver to use.
     */
    public constructor(codeActionCollection: CodeActionCollection, codeActionEditResolver: CodeActionEditResolver) {
        this.codeActionCollection = codeActionCollection;
        this.codeActionEditResolver = codeActionEditResolver;
    }

    /**
     * Provides code actions for the given document.
     *
     * @param {TextDocument} document The document that we're providing actions for.
     * @param {Range} range The range for the code actions to provide.
     * @param {CodeActionContext} _context The context object for the actions.
     * @param {CancellationToken} _cancellationToken The token for cancelling the request.
     */
    public provideCodeActions(
        document: TextDocument,
        range: Range,
        _context: CodeActionContext,
        _cancellationToken: CancellationToken
    ): ProviderResult<CodeAction[]> {
        const allActions = this.codeActionCollection.get(document.uri);
        if (!allActions) {
            return [];
        }

        // Filter the actions by the range if one is given.
        const filteredActions: CodeAction[] = [];
        for (const action of allActions) {
            if (!action.diagnostics || action.diagnostics.length !== 1) {
                continue;
            }
            const diagnostic = action.diagnostics[0];
            if (range && !range.contains(diagnostic.range)) {
                continue;
            }

            // Store the document so that we can resolve the code action easily.
            action.document = document;

            filteredActions.push(action);
            filteredActions.push(...this.getSupplementalActions(document, diagnostic));
        }

        return filteredActions;
    }

    /**
     * Resolves the code action's `edit` property.
     *
     * @param {CodeAction} codeAction The code action to resolve.
     * @param {CancellationToken} _cancellationToken The cancellation token.
     */
    public resolveCodeAction(
        codeAction: CodeAction,
        cancellationToken: CancellationToken
    ): ProviderResult<CodeAction> {
        return new Promise<CodeAction>(
            (resolve) => {
                // Resolve early if the request is cancelled.
                cancellationToken.onCancellationRequested(() => resolve(codeAction));

                this.codeActionEditResolver.resolve(
                    codeAction,
                    (edit) => {
                        if (edit) {
                            codeAction.edit = edit;
                        }

                        resolve(codeAction);
                    },
                    cancellationToken
                );
            }
        );
    }

    /**
     * Fetches all of the supplemental actions that this one has created.
     *
     * @param {TextDocument} document The document for the actions.
     * @param {Diagnostic} diagnostic The diagnostic we're building actions for.
     */
    private getSupplementalActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        const supplementalActions: CodeAction[] = [];

        const action = new CodeAction('Ignore ' + diagnostic.code + ' for this line', CodeActionKind.QuickFix);
        action.diagnostics = [ diagnostic ];
        action.command = {
            title: 'Ignore PHP_CodeSniffer',
            command: IgnoreLineCommand.COMMAND,
            arguments: [
                document,
                diagnostic.code,
                diagnostic.range.start.line
            ]
        };
        supplementalActions.push(action);

        return supplementalActions;
    }
}
