import { describe, mock, beforeEach, afterAll, test, jest, expect, it } from "bun:test";
import { store, QrFormat, RequestState, ChatMode } from './store';
import { createStore } from 'zustand/vanilla';

describe('Zustand Store', () => {
    beforeEach(() => {
        store.setState(store.getInitialState());
    });

    it("should add a new chat", () => {
        store.getState().newChat(1);
        expect(store.getState().chats).toHaveLength(1);
        expect(store.getState().chats[0].id).toBe(1);
        expect(store.getState().chats[0].format).toBe(QrFormat.Png);
        expect(store.getState().chats[0].mode).toBe(ChatMode.Normal);
    });

    it("should set chat format", () => {
        store.getState().newChat(1);
        store.getState().setChatFormat(1, QrFormat.Svg);
        expect(store.getState().chats[0].format).toBe(QrFormat.Svg);
    });

    it("should set chat mode", () => {
        store.getState().newChat(1);
        store.getState().setChatMode(1, ChatMode.Settings);
        expect(store.getState().chats[0].mode).toBe(ChatMode.Settings);
    });

    it("should add a new request", () => {
        store.getState().newRequest({ id: 1, chatId: 1, text: "test", format: QrFormat.Png });
        expect(store.getState().requests).toHaveLength(1);
        expect(store.getState().requests[0].state).toBe(RequestState.New);
    });

    it("should process a request", () => {
        store.getState().newRequest({ id: 1, chatId: 1, text: "test", format: QrFormat.Png });
        store.getState().processRequest(1);
        expect(store.getState().requests[0].state).toBe(RequestState.Processing);
    });

    it("should complete a request", () => {
        store.getState().newRequest({ id: 1, chatId: 1, text: "test", format: QrFormat.Png });
        store.getState().completeRequest({ id: 1, response: "done" });
        expect(store.getState().requests[0].state).toBe(RequestState.Completed);
        expect(store.getState().requests[0].response).toBe("done");
    });

    it("should abort a request", () => {
        store.getState().newRequest({ id: 1, chatId: 1, text: "test", format: QrFormat.Png });
        store.getState().abortRequest({ id: 1, error: new Error("failed") });
        expect(store.getState().requests[0].state).toBe(RequestState.Error);
        expect(store.getState().requests[0].response).toBeInstanceOf(Error);
    });

    it("should generate a QR code", async () => {
        const result = await store.getState().genQr({ text: "test", format: QrFormat.Png });
        expect(result).toMatch("generatedImages\\test_qr.png");
    });
});
