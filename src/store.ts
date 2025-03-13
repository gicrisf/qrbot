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
}

export const store = createStore<State & Action>((set, get) => ({
    ...initialState,
    sendMessage: (chatId, text) => {
        const currentState = get().currentState;
        if (currentState.type == "ProcessingInput") {
            get().endProcessingInput(chatId, text, currentState.msgId);
        } else {
            set({
                chatId,
                currentState: { type: 'Responding', message: text }
            })
        }
    },
    waitForCommand: (chatId) => {
        set({
            chatId,
            currentState: { type: 'WaitingForCommand' }
        });
    },
    startProcessingInput: (chatId) => {
        set({
            chatId,
            currentState: { type: 'StartProcessingInput' }
        });
    },
    processingInput: (chatId, loadingMsgId) => {
        set({
            chatId,
            currentState: { type: 'ProcessingInput', msgId: loadingMsgId }
        });
    },
    endProcessingInput: (chatId, text, loadingMsgId) => {
        set({
            chatId,
            currentState: { type: 'EndProcessingInput', message: text, msgId: loadingMsgId }
        });
    },
    // TODO userId not useful, I guess?
    handleIncomingQrRequest: ({ chatId, userId, text }) => {
        Promise.resolve()
            .then(() =>
                get().startProcessingInput(chatId))
            .then(() => {
                get().generateQRCode(text, 'png')
            })
            .catch((error) => {
                const errText = `An error occurred while generating the QR code: ${error}`;
                get().endProcessingInput(chatId, errText, get().currentState.msgId)
            });
    },
    generateQRCode: (text, format) => {
        const sanitizedFileName = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const outputFileName = `${sanitizedFileName}_qr.${format}`;

        return new Promise<void>((resolve, reject) => {
            toFile(outputFileName, text, {
                type: format,
                errorCorrectionLevel: 'H'
            }, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        })
        .then(() => {
            const succTest = `QR code saved as ${outputFileName}`;
            const checkForLoadingMsg = () => {
                return new Promise(res => setTimeout(res, 1000))
                    .then(() => {
                        if (get().currentState.type == "ProcessingInput") {
                            get().endProcessingInput(get().chatId, succTest, get().currentState.msgId)
                        } else {
                            checkForLoadingMsg()
                        }
                    })
            }
            checkForLoadingMsg();
        });
    }
}));
