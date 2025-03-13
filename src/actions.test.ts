import { createStore } from 'zustand/vanilla';
import { toFile } from 'qrcode';
import { store } from './store';

import { describe, mock, beforeEach, test, jest, expect } from "bun:test";

mock.module('qrcode', () => ({
    toFile: jest.fn((_, __, cb) => cb(null))
}));

// const mockToFile = toFile as jest.MockedFunction<typeof toFile>;

describe('Zustand Store Actions', () => {
    beforeEach(() => {
        // Reset store state and mocks before each test
        store.setState({
            inputText: '',
            outputFileName: '',
            message: '',
            currentState: { type: 'WaitingForCommand' }
        });
        jest.clearAllMocks();
    });

    test('generateQRCode success flow', async () => {
        mock.module('qrcode', () => ({
            toFile: jest.fn((_, __, cb) => {
                cb(null)
                return {} as any;
            })
        }));

        await store.getState().generateQRCode('test', 'png');

        expect(store.getState().currentState.message).toMatch(/QR code saved as test_qr\.png/);
        expect(store.getState().currentState.type).toBe('WaitingForCommand');
    });

    // test('generateQRCode error handling', async () => {
    //   mockToFile.mockImplementation((_path, _text, _options, callback) => {
    //     callback(new Error('Generation failed'));
    //     return {} as any;
    //   });

    //   await store.getState().generateQRCode('test', 'png');

    //   expect(store.getState().message).toMatch(/An error occurred while generating/);
    //   expect(store.getState().currentState.type).toBe('WaitingForCommand');
    // });

    test('emulateLongProcess completes after delay', async () => {
        jest.useFakeTimers();

        const promise = store.getState().emulateLongProcess();

        // Fast-forward until all timers have been executed
        jest.runAllTimers();

        await promise;
        expect(store.getState().currentState.type).toBe('WaitingForCommand');

        jest.useRealTimers();
    });

    test('waitForCommand resets state', () => {
        store.setState({
            currentState: { type: 'Responding', message: 'Test' }
        });

        store.getState().waitForCommand();

        expect(store.getState().currentState).toEqual({
            type: 'WaitingForCommand'
        });
    });
});
