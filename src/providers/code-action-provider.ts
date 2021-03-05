import {
    CancellationToken,
    CodeActionContext,
    CodeActionProvider as BaseProvider,
    ProviderResult,
    Range,
    TextDocument,
} from 'vscode';
import { CodeAction, CodeActionCollection } from '../types';
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
        if (!codeAction.document) {
            return codeAction;
        }

        return this.codeActionEditResolver.resolve(codeAction, cancellationToken);
    }
}
