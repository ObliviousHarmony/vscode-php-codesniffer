import { CodeAction as BaseCodeAction, TextDocument, Uri } from 'vscode';

/**
 * A custom code action class that adds a Uri for associating it with a document.
 */
export class CodeAction extends BaseCodeAction {
	/**
	 * The document associated with the code action.
	 */
	public document?: TextDocument;
}

/**
 * A collection of CodeAction instances keyed by the Uri.
 */
export class CodeActionCollection extends Map<Uri, CodeAction[]> {}
