import { CodeAction as BaseCodeAction, TextDocument } from 'vscode';
import { UriMap } from './common/uri-map';

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
export class CodeActionCollection extends UriMap<CodeAction[]> {}
