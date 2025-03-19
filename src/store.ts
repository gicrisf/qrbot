import { exists, mkdir } from 'fs/promises';
import { join } from 'path';
import { createStore } from 'zustand/vanilla';
import { produce } from 'immer';
import QRCode from 'qrcode';

const global_overload_limit = 5;

export enum QrFormat {
    Png = "png",
    Svg = "svg",
    Utf8 = "utf8",
}

export enum RequestState {
    New = "New",
    Processing = "Processing",
    Completed = "Completed",
    Error = "Error",
}

export type Request = {
    id: number;
    chatId: number;
    text: string;
    state: RequestState;
    format: QrFormat;
    response: string | null;
}

export enum ChatMode {
    Normal = "Normal",
    Settings = "Settings",
}

type Chat = {
    id: number;
    userId: number;
    format: QrFormat;
    mode: ChatMode;
}

export enum BotState {
    Idle = 0,
    Overloaded = 1
}

interface State {
    filesDirectory: string;
    chats: Chat[];
    requests: Request[];
    state: BotState;
}

const initialState: State = {
    filesDirectory: "generatedImages",
    chats: [],
    requests: [],
}

interface Action {
    newChat: (id: number) => void;
    setChatFormat: (id: number, format: QrFormat) => void;
    setChatMode: (id: number, mode: ChatMode) => void;

    newRequest: ({ id, chatId, text, format }: { id: number, chatId: number, text: string, format: QrFormat }) => void;
    processRequest: (id: number) => void;
    completeRequest: ({ id, response }: { id: number, response: string }) => void;
    abortRequest: ({ id, error }: { id: number, error: Error }) => void;

    genQr: ({ text, format }: { text: string, format: QrFormat }) => Promise<string>;
}

export const store = createStore<State & Action>((set, get) => ({
    ...initialState,

    newChat: (id) => set(
        produce((state) => {
            state.chats.push({
                id,
                format: QrFormat.Png,
                mode: ChatMode.Normal,
            })
        })
    ),

    setChatFormat: (id, format) => set(
        produce((state) => {
            const chat = state.chats.find((chat: Chat) => chat.id === id);
            // TODO Else? It must exists.
            if (chat) {
                chat.format = format;
            }
        })
    ),

    setChatMode: (id, mode) => set(
        produce((state) => {
            const chat = state.chats.find((chat: Chat) => chat.id === id);
            // TODO Else? It must exists.
            if (chat) {
                chat.mode = mode;
            }
        })
    ),

    newRequest: ({ id, chatId, text, format }) => set(
        produce((state) => {
            const requests_not_done = state.requests.filter((req: Request) => req.state === RequestState.New || req.state === RequestState.Processing);

            if (requests_not_done.length >= global_overload_limit) {
                state.state = BotState.Overloaded;
                console.log(`overload at ${Date.now()}! Number of active requests: ${state.requests.length}`);
            } else {
                state.state = BotState.Idle;
                state.requests = [
                    ...requests_not_done,
                    {
                        id,
                        chatId,
                        text,
                        format,
                        state: RequestState.New,
                        responseId: null,
                        response: null,
                    }
                ];
            }
        })
    ),

    processRequest: (id) => set(
        produce((state) => {
            const req = state.requests.find((req: Request) => req.id === id);
            if (req) { req.state = RequestState.Processing }
        })
    ),

    completeRequest: ({ id, response }) => set(
        produce((state) => {
            const req = state.requests.find((req: Request) => req.id === id);
            if (req) {
                req.state = RequestState.Completed
                req.response = response
            }
        })
    ),

    abortRequest: ({ id, error }) => set(
        produce((state) => {
            const req = state.requests.find((req: Request) => req.id === id);
            if (req) {
                req.state = RequestState.Error
                req.response = error
            }
        })
    ),

    genQr: ({ text, format }) => {
        const sanitizedFileName = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const outputDir = 'generatedImages';
        const outputFileName = join(outputDir, `${sanitizedFileName}_qr.${format}`);

        return exists(outputDir)
            .then((dirExists) => {
                if (!dirExists) {
                    return mkdir(outputDir, { recursive: true });
                }
            })
            .then(() => QRCode.toFile(outputFileName, text, {
                type: format,
                scale: 10,
                errorCorrectionLevel: 'H'
            }))
            .then(() => outputFileName);
    },
}));
