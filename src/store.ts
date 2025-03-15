import { createStore } from 'zustand/vanilla';
import { produce } from 'immer';
import QRCode from 'qrcode';

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

type Request = {
    id: number;
    state: RequestState;
    format: QrFormat;
    response: string | null;
}

interface State {
    chatId: number;
    userId: number;
    format: QrFormat;
    activeRequests: Request[];
}

const initialState: State = {
    chatId: 0,
    userId: 0,
    format: QrFormat.Png,
    activeRequests: [],
};

interface Action {
    handleIncomingQrRequest:
    (payload: { chatId: number; userId: number; text: string }) => void;
    generateQRCode: (text: string, format: string) => Promise<void>;

    setChatId: (id: number) => void;
    setUserId: (id: number) => void;

    newRequest: ({ id: number, text: string }) => void;
    processRequest: (id: number) => void;
    completeRequest: ({ id: number, response: string }) => void;
}

export const store = createStore<State & Action>((set, get) => ({
    ...initialState,

    setChatId: (id) => set(
        produce((state) => {
            state.chatId = id;
        })
    ),

    setUserId: (id) => set(
        produce((state) => {
            state.userId = id;
        })
    ),

    newRequest: ({ id, text }) => set(
        produce((state) => {
            state.activeRequests.push({
                id,
                text,
                format: state.format,
                state: RequestState.New,
                response: null,
            })
        })),

    processRequest: (id) => set(
        produce((state) => {
            const req = state.activeRequests.find(req => req.id === id);
            if (req) { req.state = RequestState.Processing }
        })
    ),

    completeRequest: ({ id, response }) => set(
        produce((state) => {
            const req = state.activeRequests.find(req => req.id === id);
            if (req) {
                req.state = RequestState.Completed
                req.response = response
            }
        })
    ),

    abortRequest: ({ id, error }) => set(
        produce((state) => {
            const req = state.activeRequests.find(req => req.id === id);
            if (req) {
                req.state = RequestState.Error
                req.response = error
            }
        })
    ),

    genQr: ({ text, format }) => {
        const sanitizedFileName = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const outputFileName = `${sanitizedFileName}_qr.${format}`;

        return QRCode.toFile(outputFileName, text, {
            type: format,
            errorCorrectionLevel: 'H'
        })
        .then(() => {
            return `QR code saved as ${outputFileName}`;
        })
    },

    handleIncomingQrRequest: ({ id, text }) => {
        // Add new request
        get().newRequest({ id, text });
        get().processRequest(id);

        return get().genQr({ text, format: get().format })
            .then((response) => get().completeRequest({ id, response }))
            .catch((error) =>  get().abortRequest({ id, error }));
    }
}));
