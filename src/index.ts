import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import { store, RequestState } from './store.ts';

// Disable octet stream warning
// https://github.com/yagop/node-telegram-bot-api/issues/838
process.env.NTBA_FIX_319 = 1;
process.env.NTBA_FIX_350 = 0;

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
  console.log(msg);
  bot.sendMessage(chatId, `You said: ${text}`);
});

bot.onText(/\/qr (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  // Text after '/qr'
  const text = match[1];

  // TODO replace with actual chat state management
  const currentState = store.getState();
  if (currentState.chatId != chatId) {
    store.getState().setChatId(chatId);
  }

  if (currentState.userId != userId) {
    store.getState().setUserId(userId);
  }

  store.getState().handleIncomingQrRequest({ id: msg.message_id, text });
});

const animateLoading = ({ messageId, requestId }) => {
  return new Promise((resolve) => {
    const getRequest = () => store
      .getState()
      .activeRequests
      .find(req => req.id === requestId);

    const condition = () => getRequest().state === RequestState.Processing;

    // Return messageId immediately if condition is not met
    if (!condition()) {
      resolve(messageId);
      return;
    }

    const phases = ['.', '..', '...'];
    const chatId = store.getState().chatId;

    const runSteps = () => {
      const steps = phases.reduce((promiseChain, phase) => {
        return promiseChain
          .then(() => {
            if (condition()) {
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
        if (condition()) {
          runSteps();
        } else {
          // Resolve with messageId when condition is no longer met
          resolve(messageId);
        }
      });
    };

    runSteps();
  });
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
        switch (currentRequest.state) {
          case RequestState.New:
            console.log("Request is now New:", currentRequest.id);
            break;
          case RequestState.Processing: {
            console.log("Request is now Processing:", currentRequest.id);
            bot.sendMessage(
              currentState.chatId,
              `Request is now Processing: ${currentRequest.id}`, {
                reply_to_message_id: currentRequest.id
              })
              .then((sentMessage) => {
                return animateLoading({
                  // The message we need to edit
                  messageId: sentMessage.message_id,
                  // The request we need to check for
                  requestId: currentRequest.id
                });
              });

            break;
          };
          case RequestState.Completed:
            console.log("Request is now Completed:", currentRequest);
            bot.sendPhoto(currentState.chatId,
                          fs.createReadStream(currentRequest.response),
                          { caption: currentRequest.response,
                            reply_to_message_id: currentRequest.id
                          })
                .then(() => console.log('Photo sent!'))
                .catch(err => console.error('Error sending photo:', err));

            break;
          case RequestState.Error:
            console.log("Request is now in Error state:", currentRequest.id);
            break;
          default:
            console.log("Unknown state for request:", currentRequest.id);
            break;
        }
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

