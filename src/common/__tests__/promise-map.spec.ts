import { PromiseMap, PromiseMapReplacementError } from '../promise-map';

describe('PromiseMap', () => {
	let promiseMap: PromiseMap<string, string>;

	beforeEach(() => {
		promiseMap = new PromiseMap();
	});

	it('should resolve promises', () => {
		const mockResolve = jest.fn();
		const mockReject = jest.fn();

		promiseMap.set('test', mockResolve, mockReject, 'test-data');

		expect(promiseMap.has('test')).toBeTruthy();

		promiseMap.resolve('test', 'resolve-test');

		expect(promiseMap.has('test')).toBeFalsy();
		expect(mockResolve).toHaveBeenCalledWith('resolve-test');
		expect(mockReject).not.toHaveBeenCalled();
	});

	it('should reject promises', () => {
		const mockResolve = jest.fn();
		const mockReject = jest.fn();

		promiseMap.set('test', mockResolve, mockReject, 'test-data');

		expect(promiseMap.has('test')).toBeTruthy();

		promiseMap.reject('test', 'reject-test');

		expect(promiseMap.has('test')).toBeFalsy();
		expect(mockResolve).not.toHaveBeenCalled();
		expect(mockReject).toHaveBeenCalledWith('reject-test');
	});

	it('should error on overlapping entries', () => {
		const mockResolve = jest.fn();
		const mockResolve2 = jest.fn();
		const mockReject = jest.fn();

		promiseMap.set('test', mockResolve, mockReject, 'test-data');
		promiseMap.set('test', mockResolve2, mockReject, 'test-data');

		expect(mockResolve).not.toHaveBeenCalled();
		expect(mockReject).toHaveBeenCalledWith(
			new PromiseMapReplacementError()
		);
		mockReject.mockClear();

		// Make sure it resolves the second execution just fine though.
		promiseMap.resolve('test', 'resolve-test');

		expect(promiseMap.has('test')).toBeFalsy();
		expect(mockResolve2).toHaveBeenCalledWith('resolve-test');
		expect(mockResolve).not.toHaveBeenCalled();
		expect(mockReject).not.toHaveBeenCalled();
	});
});
