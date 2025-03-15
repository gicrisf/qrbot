import { createStore } from 'zustand/vanilla';
import produce from 'immer';
import { store, QrFormat, RequestState } from './store';
import { describe, mock, beforeEach, test, jest, expect, it } from "bun:test";

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
