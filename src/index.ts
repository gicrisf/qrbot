import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import { store, RequestState, QrFormat } from './store.ts';

// Disable octet stream warning
// https://github.com/yagop/node-telegram-bot-api/issues/838
process.env.NTBA_FIX_319 = "1";
process.env.NTBA_FIX_350 = "0";

dotenv.config();

if (process.env.TELEGRAM_TOKEN == undefined) {
  throw new Error("TELEGRAM_TOKEN is not defined in the environment variables.");
}

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    { polling: true }
);

bot.onText(/\/start/, (msg: TelegramBot.Message) => {
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

bot.onText(/\/settings/, (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const settingsMessage = `⚙️ **Settings**
Choose the QR code format:
1. PNG (default)
2. SVG

Reply with the number of your choice.`;

  bot.sendMessage(chatId, settingsMessage, {
    reply_markup: {
      keyboard: [
        [{ text: '/set 1. PNG' },
         { text: '/set 2. SVG' }]
      ],
      one_time_keyboard: true,
    },
  });

  // Handle user's choice
  bot.once('message', (msg: TelegramBot.Message) => {
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

    store.getState().setChatFormat(chatId, format);
    console.log(store.getState());

    bot.sendMessage(chatId, `✅ QR code format set to ${format.toUpperCase()}.`);
  });
});

bot.on('message', (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const id = msg.message_id;
  const text = msg.text;

  // kinda awful
  let chat = store.getState().chats.find(chat => chat.id === chatId);

  if (!chat) {
    // const userId = msg.from.id;
    store.getState().newChat(chatId);
    chat = store.getState().chats.find(chat => chat.id === chatId);
    console.log("new chat!", chat);
  };

  if (chat && text) {
    // Ignore commands (start, help, settings)
    if (text.startsWith('/')) {
      return;
    };

    const format: QrFormat = chat.format;

    store.getState().newRequest({ id, chatId, text, format });
    store.getState().processRequest(id);
    store.getState().genQr({ text, format })
      .then((response) => store.getState().completeRequest({ id, response }))
      .catch((error: Error) =>  store.getState().abortRequest({ id, error }));
  }
});

const animateLoading = ({ messageId, requestId } : { messageId: number, requestId: number }) => {
  return new Promise((resolve) => {
    const getRequest = () => store
      .getState()
      .requests
      .find(req => req.id === requestId);

    const condition = () => getRequest().state === RequestState.Processing;

    // Return messageId immediately if condition is not met
    if (!condition()) {
      resolve(messageId);
      return;
    }

    const phases = ['.', '..', '...'];
    const chatId = getRequest().chatId;

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
    if (currentState.requests.length > previousState.requests.length) {
      const previousIds = previousState.requests.map(item => item.id);
      const newElements = currentState.requests.filter(item => !previousIds.includes(item.id));
      console.log("new request!", newElements);
    }

    // Check for state changes in existing requests
    currentState.requests.forEach(currentRequest => {
      const previousRequest = previousState.requests.find(req => req.id === currentRequest.id);
      if (previousRequest && previousRequest.state !== currentRequest.state) {
        switch (currentRequest.state) {
          case RequestState.New:
            console.log("Request is now New:", currentRequest.id);
            break;
          case RequestState.Processing: {
            console.log("Request is now Processing:", currentRequest.id);
            bot.sendMessage(
              currentRequest.chatId,
              `Bot is now Processing: ${currentRequest.text}`, {
                reply_to_message_id: currentRequest.id
              })
              .then((sentMessage: TelegramBot.Message) => {
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
            const format = currentRequest.format;

            if (format === QrFormat.Png) {
              bot.sendPhoto(
                currentRequest.chatId,
                fs.createReadStream(currentRequest.response),
                {
                  caption: `QR image for request: ${currentRequest.text}`,
                  reply_to_message_id: currentRequest.id
                }
              )
                .then(() => console.log('Photo sent!'))
                .catch((err: Error) => console.error('Error sending photo:', err));
            } else if (format === QrFormat.Svg) {
              bot.sendDocument(
                currentRequest.chatId,
                fs.createReadStream(currentRequest.response),
                {
                  caption: `QR image for request: ${currentRequest.text}`,
                  reply_to_message_id: currentRequest.id
                }
              )
                .then(() => console.log('SVG sent!'))
                .catch((err: Error) => console.error('Error sending SVG:', err));
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

bot.on('polling_error', (error: Error) => {
  console.error('Polling error:', error);
  unsubscribe();
});

