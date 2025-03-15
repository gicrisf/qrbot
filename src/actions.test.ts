import { createStore } from 'zustand/vanilla';
import produce from 'immer';
import { store, QrFormat, RequestState } from './store';
import { describe, mock, beforeEach, afterAll, test, jest, expect, it } from "bun:test";
import { exists, unlink, rmdir } from 'fs/promises';
import { join } from 'path';

describe('Zustand Store', () => {
    beforeEach(() => {
        // Reset store state and mocks before each test
        store.setState({
            chatId: 0,
            userId: 0,
            format: QrFormat.Png,
            activeRequests: [],
        });
        jest.clearAllMocks();
    });

    it('should add a request', () => {
        const request = {
            id: 1,
            state: RequestState.New,
            format: QrFormat.Png,
            response: null,
        };

        store.getState().newRequest(request);

        const state = store.getState();
        expect(state.activeRequests).toContainEqual(request);
    });

    it('should update the state of an existing request', () => {
        const id = 1;
        const request: Request = {
            id,
            state: RequestState.New,
            format: QrFormat.Png,
            response: null,
        };

        store.getState().newRequest(request);
        store.getState().processRequest(id);

        const state = store.getState();
        const updated = state.activeRequests.find(req => req.id === id);
        expect(updated.state).toBe(RequestState.Processing);
    });

    it('should NOT update the state of a non-existent request', () => {
        const id = 1;
        const request: Request = {
            id,
            state: RequestState.New,
            format: QrFormat.Png,
            response: null,
        };

        store.getState().newRequest(request);
        store.getState().processRequest(2);

        const state = store.getState();
        const updated = state.activeRequests.find(req => req.id === 2);
        expect(updated).toBeUndefined();
    });
});

describe('genQr', () => {
    const outputDir = 'generatedImages';
    const testText = 'Hello, World!';
    const testFormat = 'png';
    const genQr = store.getState().genQr;

    beforeEach(() => {
        // Reset store state and mocks before each test
        store.setState({
            chatId: 0,
            userId: 0,
            format: QrFormat.Png,
            activeRequests: [],
        });
        jest.clearAllMocks();
    });

    afterAll(async () => {
        // Clean up generated files and directory
        const outputFile = join(outputDir, `${testText.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_qr.${testFormat}`);
        if (await exists(outputFile)) {
            await unlink(outputFile);
        }
        if (await exists(outputDir)) {
            await rmdir(outputDir);
        }
    });

    it('should generate a QR code and save it to the correct file', async () => {
        const result = await genQr({ text: testText, format: testFormat });
        expect(result).toMatch(/QR code saved as .*\.png/);

        const outputFile = join(outputDir, `${testText.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_qr.${testFormat}`);
        expect(await exists(outputFile)).toBe(true);
    });

    it('should create the output directory if it does not exist', async () => {
        if (await !exists(outputDir)) {
            await genQr({ text: testText, format: testFormat });
            expect(await exists(outputDir)).toBe(true);
        }
    });
});
