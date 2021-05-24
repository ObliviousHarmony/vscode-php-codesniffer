import {
	Disposable,
	StatusBarAlignment,
	StatusBarItem,
	Uri,
	window as vsCodeWindow,
} from 'vscode';
import { UriSet } from '../common/uri-set';

/**
 * A class for managing the linter's status.
 */
export class LinterStatus implements Disposable {
	/**
	 * The status bar item we're using to display the status of the linter.
	 */
	private readonly statusBar: StatusBarItem;

	/**
	 * The documents that are actively being linted.
	 */
	private readonly activeDocuments: UriSet;

	/**
	 * Constructor.
	 */
	public constructor(window: typeof vsCodeWindow) {
		this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left);
		this.activeDocuments = new UriSet();
	}

	/**
	 * Cleans up the class' resources.
	 */
	public dispose(): void {
		this.statusBar.dispose();
	}

	/**
	 * Records that a document has begun being linted.
	 *
	 * @param {Uri} documentUri The Uri for a document being linted.
	 */
	public start(documentUri: Uri): void {
		this.activeDocuments.add(documentUri);
		this.updateBar();
	}

	/**
	 * Records that a document has stopped being linted.
	 *
	 * @param {Uri} documentUri The Uri for a document being linted.
	 */
	public stop(documentUri: Uri): void {
		this.activeDocuments.delete(documentUri);
		this.updateBar();
	}

	/**
	 * Updates the status bar content according to the linting that is taking place.
	 */
	private updateBar(): void {
		// Hide the status bar when there's no documents linting.
		if (this.activeDocuments.size === 0) {
			this.statusBar.hide();
			return;
		}

		// Make sure the status bar is visible.
		this.statusBar.show();

		// Update the status to indicate the number of documents we're procesing.
		let status = '$(sync~spin) PHP_CodeSniffer Processing ';
		if (this.activeDocuments.size > 1) {
			status += this.activeDocuments.size + ' documents...';
		} else {
			status += '1 document...';
		}

		this.statusBar.text = status;
	}
}
