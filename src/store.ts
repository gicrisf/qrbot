import { createStore } from 'zustand/vanilla';
import { toFile } from 'qrcode';

type BotState =
    | { type: "WaitingForCommand" }
    | { type: "StartProcessingInput" }
    | { type: "ProcessingInput"; msgId: number }
    | { type: "EndProcessingInput"; message: string; msgId: number }
    | { type: "Responding"; message: string }
    | { type: "Error"; error: string };

interface State {
    chatId: number;
    userId: number;
    messageHistory: string[];
    currentState: BotState;
}

const initialState: State = {
    chatId: 0,
    userId: 0,
    messageHistory: [],
    currentState: { type: "WaitingForCommand" },
};

interface Action {
    handleIncomingQrRequest:
    (payload: { chatId: number; userId: number; text: string }) => void;
    generateQRCode: (text: string, format: string) => Promise<void>;
    emulateLongProcess: () => Promise<void>;
}

export const store = createStore<State & Action>((set, get) => ({
    ...initialState,
    sendMessage: (chatId, text) => {
        const currentState = get().currentState;
        if (currentState.type == "ProcessingInput") {
            get().endProcessingInput(chatId, text, currentState.msgId);
        } else {
            set((state) => ({
                chatId,
                currentState: { type: 'Responding', message: text },
            }))
        }
    },
    waitForCommand: (chatId) => {
        set((state) => ({
            chatId,
            currentState: { type: 'WaitingForCommand' },
        }))
    },
    startProcessingInput: (chatId) => {
        set((state) => ({
            chatId,
            currentState: { type: 'StartProcessingInput' },
        }))
    },
    processingInput: (chatId, loadingMsgId) => {
        set((state) => ({
            chatId,
            currentState: { type: 'ProcessingInput', msgId: loadingMsgId },
        }))
    },
    endProcessingInput: (chatId, text, loadingMsgId) => {
        set((state) => ({
            chatId,
            currentState: {
                type: 'EndProcessingInput',
                message: text,
                msgId: loadingMsgId,
            }
        }))
    },
    handleIncomingQrRequest: ({ chatId, userId, text }) => {
        set((state) => ({
            chatId,
            userId,
            messageHistory: [...state.messageHistory, text],
            // TODO update to new state
            currentState: { type: 'ProcessingInput' },
        }));

        store.getState().generateQRCode(text, 'png').then(() => {
            console.log(`printed: ${text}`);
        });
    },
    generateQRCode: (text, format) => {
        const sanitizedFileName = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const outputFileName = `${sanitizedFileName}_qr.${format}`;

        return new Promise<void>((resolve, reject) => {
            const success = toFile(outputFileName, text, {
                type: format,
                errorCorrectionLevel: 'H'
            }, (err) => {
                if (err) {
                    if (err) throw err;
                }
                else {
                    const text = `QR code saved as ${outputFileName}`;
                    // TODO Use the action! setNewMessage
                    set((state) => ({
                        chatId: state.chatId,
                        currentState: { type: 'Responding', message: text },
                    }))
                }
            });
        }).catch((error) => {
            const text = `An error occurred while generating the QR code: ${error}`;
            // TODO Use the action!
            set((state) => ({
                chatId: state.chatId,
                currentState: { type: 'Responding', message: text },
            }));
        });
    },
    emulateLongProcess: () => {
        // emulate a 10 seconds job
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 10000)
        });
    },
}));
