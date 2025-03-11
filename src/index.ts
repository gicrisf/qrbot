import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { store } from './store.ts';

dotenv.config();

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

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
  const text = 'Hello, give me a string after `/qr` and I`ll turn it into a QR code for you!';
  store.getState().sendMessage(chatId, text);
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

bot.onText(/\load/, (msg) => {
  Promise.resolve()
    .then(() =>
      store.getState().startProcessingInput(msg.chat.id))
    .then(() =>
      store.getState().emulateLongProcess())
    .then(() =>
      store.getState().endProcessingInput(msg.chat.id, "Long process ended.", store.getState().currentState.msgId))
    .catch((error) => {
      console.error("An error occurred:", error);
    });
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

const unsubscribe = store.subscribe(
  (state) => {
    switch (state.currentState.type) {
      case "Responding": {
        const newText = state.currentState.message;
        bot.sendMessage(state.chatId, newText);
        state.waitForCommand();
        break;
      };
      case "StartProcessingInput": {
        bot.sendMessage(state.chatId, '...')
          .then((sentMessage) => {
            state.processingInput(state.chatId, sentMessage.message_id);
          });
      };
      case "ProcessingInput": {
        const loadingMsgId = state.currentState.msgId;
        if (loadingMsgId) {
          animateLoading(state.chatId, loadingMsgId);
        }
      };
      case "EndProcessingInput": {
        const newText = state.currentState.message;
        if (newText) {
          bot.editMessageText(
            newText, {
              chat_id: state.chatId,
              message_id: state.currentState.msgId,
            });
        }
      }
      default:
        break;
    }
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

