import { createStore } from 'zustand/vanilla';
import { toFile } from 'qrcode';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

type BotState =
  | { type: "WaitingForCommand" }
  | { type: "ProcessingInput" }
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
  message: '',
};

interface Action {
  handleIncomingQrRequest:
  (payload: { chatId: number; userId: number; text: string }) => void;
  generateQRCode: (text: string, format: string) => Promise<void>;
}

const store = createStore<State & Action>((set) => ({
  ...initialState,
  handleIncomingQrRequest: ({ chatId, userId, text }) => {
    set((state) => ({
      chatId,
      userId,
      messageHistory: [...state.messageHistory, text],
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
          throw err
          return false;
        }
        else {
          console.log(`QR code saved as ${outputFileName}`);
          return true;
        }
      });

      // const success = true; // Simulate success
      if (success) {
        set({ message: `File saved successfully! (${outputFileName})` });
        resolve();
      } else {
        reject(new Error('Failed to save file.'));
      }
    }).catch((error) => {
      set({ message: `An error occurred while generating the QR code: ${error}` });
    });
  },
}));

// To stop listening to changes, call unsubscribe()

// Example usage outside of React
// store.getState().generateQRCode('ciao', 'png').then(() => {
//   console.log(store.getState().message); // Output: "File saved successfully! (exampletext_qr.png)"
// });

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Hello, give me a string after `/qr` and I`ll turn it into a QR code for you!');
});

bot.onText(/\/qr (.+)/, (msg, match) => {
  // Text after '/qr'
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = match[1];
  // this gives polling error
  new Promise((resolve) => {
    resolve(store.getState()
      .handleIncomingQrRequest({ chatId, userId, text }));
  }).then(() => {
    // I would associate this to a subscription
    bot.sendMessage(chatId, `You sent: ${text}`);
  })
});
