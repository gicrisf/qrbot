import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import { store, RequestState, QrFormat } from './store.ts';

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
  const welcomeMessage = `👋 Welcome to the QR Code Bot!
I can generate QR codes from text.
Send me any text, and I'll create a QR code for you!
Use /help for more info.`;

  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `📖 **How to Use This Bot**
1. Send me any text, and I'll generate a QR code for it.
2. Use /settings to configure the QR code format (e.g., PNG, SVG).
3. Use /start to see the welcome message again.

**Commands:**
/start - Welcome message
/help - Show this help message
/settings - Configure QR code settings`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const settingsMessage = `⚙️ **Settings**
Choose the QR code format:
1. PNG (default)
2. SVG

Reply with the number of your choice.`;

  bot.sendMessage(chatId, settingsMessage, {
    reply_markup: {
      // keyboard: [['1. PNG', '2. SVG', '3. UTF-8']],
      keyboard: [['/set 1. PNG', '/set 2. SVG']],
      one_time_keyboard: true,
    },
  });

  // Handle user's choice
  bot.once('message', (msg) => {
    const choice = msg.text;
    let format;

    switch (choice) {
      case '/set 1. PNG':
        format = QrFormat.Png;
        break;
      case '/set 2. SVG':
        format = QrFormat.Svg;
        break;
      // Still not supported
      case '/set 3. UTF-8':
        format = QrFormat.Utf8;
        break;
      default:
        bot.sendMessage(chatId, 'Invalid choice. Please try again.');
        return;
    }

    store.getState().setFormat(format);
    console.log(store.getState());

    bot.sendMessage(chatId, `✅ QR code format set to ${format.toUpperCase()}.`);
  });
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Ignore commands (start, help, settings)
  if (text.startsWith('/')) {
    return;
  }

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
              `Bot is now Processing: ${currentRequest.text}`, {
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
            const format = store.getState().format;

            if (format === QrFormat.Png) {
              bot.sendPhoto(
                currentState.chatId,
                fs.createReadStream(currentRequest.response),
                {
                  caption: `QR image for request: ${currentRequest.text}`,
                  reply_to_message_id: currentRequest.id
                }
              )
                .then(() => console.log('Photo sent!'))
                .catch(err => console.error('Error sending photo:', err));
            } else if (format === QrFormat.Svg) {
              bot.sendDocument(
                currentState.chatId,
                fs.createReadStream(currentRequest.response),
                {
                  caption: `QR image for request: ${currentRequest.text}`,
                  reply_to_message_id: currentRequest.id
                }
              )
                .then(() => console.log('SVG sent!'))
                .catch(err => console.error('Error sending SVG:', err));
            } else {
              console.log('Unsupported format:', format);
            }

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

