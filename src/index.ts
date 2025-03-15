import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { store } from './store.ts';

dotenv.config();

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text = 'Hello, give me a string after `/qr` and I`ll turn it into a QR code for you!';
  bot.sendMessage(chatId, `You said: ${text}`);
});

bot.onText(/\/qr (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  // Text after '/qr'
  const text = match[1];
  // store.getState().handleIncomingQrRequest({ chatId, userId, text });

  store.getState().handleIncomingQrRequest({ id: msg.message_id, text });
});

const animateLoading = (chatId: number, messageId: number) => {
  const phases = ['.', '..', '...'];

  const runSteps = () => {
    const steps = phases.reduce((promiseChain, phase) => {
      return promiseChain
        .then(() => {
          if (store.getState().currentState.type == "ProcessingInput") {
            bot.editMessageText(
              phase, {
                chat_id: chatId,
                message_id: messageId
              })
          }
        })
        .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
    }, Promise.resolve());

    steps.then(() => {
      // condition could be wrapped in a lambda, maybe
      if (store.getState().currentState.type == "ProcessingInput") {
        runSteps();
      }
    });
  };
  runSteps();
};

let previousState = store.getState();

const unsubscribe = store.subscribe(
  (currentState) => {
    // Check for new entries
    if (currentState.activeRequests.length > previousState.activeRequests.length) {
      const previousIds = previousState.activeRequests.map(item => item.id);
      const newElements = currentState.activeRequests.filter(item => !previousIds.includes(item.id));
      console.log("new request!", newElements);
    }

    // Check for state changes in existing requests
    currentState.activeRequests.forEach(currentRequest => {
      const previousRequest = previousState.activeRequests.find(req => req.id === currentRequest.id);
      if (previousRequest && previousRequest.state !== currentRequest.state) {
        console.log("state changed for request:", currentRequest.id, "from", previousRequest.state, "to", currentRequest.state);
      }
    });

    previousState = currentState;
  }
);

process.on('SIGINT', () => {
  unsubscribe();
  process.exit();
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
  unsubscribe();
});

