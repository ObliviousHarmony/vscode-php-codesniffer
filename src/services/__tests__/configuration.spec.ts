import {
	TextDocument,
	workspace,
	FileSystemError,
	CancellationError,
} from 'vscode';
import {
	MockCancellationToken,
	MockTextDocument,
	Uri,
} from '../../__mocks__/vscode';
import { TextEncoder } from 'util';
import {
	Configuration,
	LintAction,
	SpecialStandardOptions,
} from '../configuration';
import { WorkspaceLocator } from '../workspace-locator';

/**
 * The default configuration options to use in our tests.
 */
type ConfigurationType = {
	autoExecutable: boolean;
	'exec.linux': string;
	'exec.osx': string;
	'exec.windows': string;
	exclude: string[];
	lintAction: LintAction;
	standard: SpecialStandardOptions | string;
	standardCustom: string;

	// Deprecated Options
	executable: string | null;
	ignorePatterns: string[] | null;
};

/**
 * A convenience function for getting the configuration options in the workspace configuration.
 */
const getDefaultConfiguration = (overrides?: Partial<ConfigurationType>) => {
	return (key: keyof ConfigurationType) => {
		if (overrides && key in overrides) {
			return overrides[key];
		}

		switch (key) {
			case 'autoExecutable':
				return false;
			case 'exec.linux':
			case 'exec.osx':
			case 'exec.windows':
				return 'test.platform';
			case 'exclude':
				return [];
			case 'lintAction':
				return LintAction.Change;
			case 'standard':
				return SpecialStandardOptions.Disabled;
			case 'standardCustom':
				return '';

			// Deprecated Settings
			case 'executable':
			case 'ignorePatterns':
				return null;
		}

		throw new Error(
			'An unexpected configuration key of ' + key + ' was received.'
		);
	};
};

jest.mock('../workspace-locator');

describe('Configuration', () => {
	let mockDocument: TextDocument;
	let mockWorkspaceLocator: WorkspaceLocator;
	let configuration: Configuration;
	let textEncoder: TextEncoder;

	beforeEach(() => {
		mockDocument = new MockTextDocument();
		mockWorkspaceLocator = new WorkspaceLocator(workspace);
		configuration = new Configuration(workspace, mockWorkspaceLocator);
		textEncoder = new TextEncoder();

		const workspaceUri = new Uri();
		workspaceUri.path = 'test';
		workspaceUri.fsPath = 'test';
		jest.mocked(
			mockWorkspaceLocator
		).getWorkspaceFolderOrDefault.mockReturnValue(workspaceUri);
	});

	afterEach(() => {
		jest.mocked(workspace).getConfiguration.mockReset();
		jest.mocked(workspace).fs.readFile.mockReset();
		jest.mocked(workspace).fs.stat.mockReset();
	});

	it('should read and cache configuration for document', async () => {
		const mockConfiguration = {
			get: jest.fn().mockImplementation(
				getDefaultConfiguration({
					exclude: ['test/{test|test-test}/*.php'],
				})
			),
		};
		jest.mocked(workspace).getConfiguration.mockReturnValue(
			mockConfiguration as never
		);

		const result = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledWith(
			'phpCodeSniffer',
			mockDocument
		);
		expect(result).toMatchObject({
			executable: 'test.platform',
			exclude: [/^(?:test\/\\{test|test-test}\/(?!\.)(?=.)[^/]*?\.php)$/],
			standard: null,
		});

		// Make sure that a subsequent fetch loads a cached instance.
		const cached = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
		expect(cached).toMatchObject(result);
	});

	it('should read filesystem for executable when enabled', async () => {
		const mockConfiguration = {
			get: jest.fn().mockImplementation(
				getDefaultConfiguration({
					autoExecutable: true,
				})
			),
		};
		jest.mocked(workspace).getConfiguration.mockReturnValue(
			mockConfiguration as never
		);

		// We will traverse from the file folder up.
		jest.mocked(workspace).fs.readFile.mockImplementation((uri) => {
			switch (uri.path) {
				case 'test/file/composer.json':
					return Promise.reject(new FileSystemError(uri));
				case 'test/composer.json':
					return Promise.resolve(
						textEncoder.encode(
							JSON.stringify({
								config: {
									'vendor-dir': 'newvendor',
								},
							})
						)
					);
			}

			throw new Error('Invalid path: ' + uri.path);
		});

		jest.mocked(workspace).fs.stat.mockImplementation((uri) => {
			switch (uri.path) {
				case 'test/newvendor/bin/phpcs.bat':
				case 'test/newvendor/bin/phpcs': {
					const ret = new Uri();
					ret.path = 'test';
					ret.fsPath = 'test';
					return Promise.resolve(ret);
				}
			}

			throw new Error('Invalid path: ' + uri.path);
		});

		const result = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledWith(
			'phpCodeSniffer',
			mockDocument
		);
		expect(result).toMatchObject({
			executable:
				process.platform === 'win32'
					? 'test/newvendor/bin/phpcs.bat'
					: 'test/newvendor/bin/phpcs',
			exclude: [],
			standard: null,
		});

		// Make sure that a subsequent fetch loads a cached instance.
		const cached = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
		expect(cached).toMatchObject(result);
	});

	it('should fall back when executable cannot be read from filesystem', async () => {
		const mockConfiguration = {
			get: jest.fn().mockImplementation(
				getDefaultConfiguration({
					autoExecutable: true,
				})
			),
		};
		jest.mocked(workspace).getConfiguration.mockReturnValue(
			mockConfiguration as never
		);

		// We will never find the folder we are looking for
		jest.mocked(workspace).fs.readFile.mockImplementation((uri) => {
			return Promise.reject(new FileSystemError(uri));
		});

		const result = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledWith(
			'phpCodeSniffer',
			mockDocument
		);
		expect(result).toMatchObject({
			executable: 'test.platform',
			exclude: [],
			standard: null,
		});

		// Make sure that a subsequent fetch loads a cached instance.
		const cached = await configuration.get(mockDocument);

		expect(workspace.getConfiguration).toHaveBeenCalledTimes(1);
		expect(cached).toMatchObject(result);
	});

	describe('should parse `standard` option', () => {
		it('disabled', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(getDefaultConfiguration()),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.platform',
				exclude: [],
				standard: null,
			});
		});

		it('default', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(
					getDefaultConfiguration({
						standard: SpecialStandardOptions.Default,
					})
				),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.platform',
				exclude: [],
				standard: '',
			});
		});

		it('custom', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(
					getDefaultConfiguration({
						standard: SpecialStandardOptions.Custom,
						standardCustom: 'test-custom',
					})
				),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.platform',
				exclude: [],
				standard: 'test-custom',
			});
		});

		it('literal', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(
					getDefaultConfiguration({
						standard: 'LITERAL',
					})
				),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.platform',
				exclude: [],
				standard: 'LITERAL',
			});
		});

		describe('automatic', () => {
			it('document folder', async () => {
				jest.mocked(workspace).fs.stat.mockImplementation((uri) => {
					switch (uri.path) {
						case 'test/file/phpcs.xml':
							return Promise.resolve({
								type: 0,
								ctime: 0,
								mtime: 0,
								size: 0,
							});
					}

					throw new Error('Invalid path: ' + uri.path);
				});

				const mockConfiguration = {
					get: jest.fn().mockImplementation(
						getDefaultConfiguration({
							standard: SpecialStandardOptions.Automatic,
						})
					),
				};
				jest.mocked(workspace).getConfiguration.mockReturnValue(
					mockConfiguration as never
				);

				const result = await configuration.get(mockDocument);

				expect(workspace.getConfiguration).toHaveBeenCalledWith(
					'phpCodeSniffer',
					mockDocument
				);
				expect(result).toMatchObject({
					executable: 'test.platform',
					exclude: [],
					standard: 'test/file/phpcs.xml',
				});
			});

			it('parent folder', async () => {
				jest.mocked(workspace).fs.stat.mockImplementation((uri) => {
					switch (uri.path) {
						case 'test/file/phpcs.xml':
						case 'test/file/.phpcs.xml':
						case 'test/file/phpcs.dist.xml':
						case 'test/file/.phpcs.dist.xml':
							return Promise.reject(new FileSystemError(uri));

						// Ignore the first filename to also test the other possible filenames.
						case 'test/phpcs.xml':
							return Promise.reject(new FileSystemError(uri));

						case 'test/.phpcs.xml':
							return Promise.resolve({
								type: 0,
								ctime: 0,
								mtime: 0,
								size: 0,
							});
					}

					throw new Error('Invalid path: ' + uri.path);
				});

				const mockConfiguration = {
					get: jest.fn().mockImplementation(
						getDefaultConfiguration({
							standard: SpecialStandardOptions.Automatic,
						})
					),
				};
				jest.mocked(workspace).getConfiguration.mockReturnValue(
					mockConfiguration as never
				);

				const result = await configuration.get(mockDocument);

				expect(workspace.getConfiguration).toHaveBeenCalledWith(
					'phpCodeSniffer',
					mockDocument
				);
				expect(result).toMatchObject({
					executable: 'test.platform',
					exclude: [],
					standard: 'test/.phpcs.xml',
				});
			});
		});
	});

	it('should support cancellation', () => {
		const cancellationToken = new MockCancellationToken();

		const mockConfiguration = {
			get: jest.fn().mockImplementation(
				getDefaultConfiguration({
					autoExecutable: true,
				})
			),
		};
		jest.mocked(workspace).getConfiguration.mockReturnValue(
			mockConfiguration as never
		);

		const promise = configuration.get(mockDocument, cancellationToken);

		// Mock a cancellation so that resolution will reject.
		cancellationToken.mockCancel();

		return expect(promise).rejects.toMatchObject(new CancellationError());
	});

	describe('should still handle deprecated options', () => {
		it('executable', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(
					getDefaultConfiguration({
						executable: 'test.override',
					})
				),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.override',
				exclude: [],
				standard: null,
			});
		});

		it('ignorePatterns', async () => {
			const mockConfiguration = {
				get: jest.fn().mockImplementation(
					getDefaultConfiguration({
						exclude: ['test/{test|test-test}/*.php'],
						ignorePatterns: ['test'],
					})
				),
			};
			jest.mocked(workspace).getConfiguration.mockReturnValue(
				mockConfiguration as never
			);

			const result = await configuration.get(mockDocument);

			expect(workspace.getConfiguration).toHaveBeenCalledWith(
				'phpCodeSniffer',
				mockDocument
			);
			expect(result).toMatchObject({
				executable: 'test.platform',
				exclude: [
					/^(?:test\/\\{test|test-test}\/(?!\.)(?=.)[^/]*?\.php)$/,
					/test/,
				],
				standard: null,
			});
		});
	});
});
