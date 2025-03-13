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
