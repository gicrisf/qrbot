import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import { store, Chat, Request, RequestState, QrFormat, ChatMode } from './store.ts';

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

bot.onText(/\/help/, (msg: TelegramBot.Message) => {
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

Use /set_png for PNG or /set_svg for SVG.`;

  bot.sendMessage(chatId, settingsMessage);

  // Mark user as having launched /settings
  store.getState().setChatMode(chatId, ChatMode.Settings);

  // Handle user's choice
  bot.once('message', (msg: TelegramBot.Message) => {
    const choice = msg.text;
    let format;

    switch (choice) {
      case '/set_png':
        format = QrFormat.Png;
        break;
      case '/set_svg':
        format = QrFormat.Svg;
        break;
      default:
        bot.sendMessage(chatId, 'Invalid choice. Please try again.');
        return;
    }

    store.getState().setChatFormat(chatId, format);

    bot.sendMessage(chatId, `✅ QR code format set to ${format.toUpperCase()}.`);
    // Back to the normal mode
    store.getState().setChatMode(chatId, ChatMode.Normal);
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
    const getRequest = () => {
      const request = store
        .getState()
        .requests
        .find(req => req.id === requestId);

      if (!request) {
        throw new Error(`Request with ID ${requestId} not found`);
      }

      return request;
    };

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

let previousRequests = store.getState().requests;
let previousChats = store.getState().chats;

const handleNewRequests = (currentRequests: Request[], previousRequests: Request[]) => {
  if (currentRequests.length > previousRequests.length) {
    const previousIds = previousRequests.map(item => item.id);
    const newElements = currentRequests.filter(item => !previousIds.includes(item.id));
  }
};

const handleStateChange = (currentRequest: Request, previousRequest: Request) => {
  if (previousRequest.state !== currentRequest.state) {
    switch (currentRequest.state) {
      case RequestState.New:
        console.log(`New request ${currentRequest.id} from ${currentRequest.chatId}`);
        break;
      case RequestState.Processing:
        console.log(`Request ${currentRequest.id} (from ${currentRequest.chatId}) is now Processing`);
        bot.sendMessage(
          currentRequest.chatId,
          `Bot is now Processing: ${currentRequest.text}`, {
            reply_to_message_id: currentRequest.id
          })
          .then((sentMessage: TelegramBot.Message) => {
            return animateLoading({
              messageId: sentMessage.message_id,
              requestId: currentRequest.id
            });
          });
        break;
      case RequestState.Completed:
        console.log(`Request ${currentRequest.id} (from ${currentRequest.chatId}) is now Completed`);
        handleCompletedRequest(currentRequest);
        break;
      case RequestState.Error:
        console.log(`Request from ${currentRequest.id} is now in Error state`);
        break;
      default:
        console.error(`Unknown state for request: ${currentRequest.id}`);
        break;
    }
  }
};

const handleCompletedRequest = (currentRequest: Request) => {
  const format = currentRequest.format;
  if (!currentRequest.response) {
    throw new Error('No local writing path provided');
  };

  switch (format) {
    case QrFormat.Png:
      bot.sendPhoto(
        currentRequest.chatId,
        fs.createReadStream(currentRequest.response),
        {
          caption: `QR image for request: ${currentRequest.text}`,
          reply_to_message_id: currentRequest.id
        }
      )
      .then(() => console.log(`Photo sent to ${currentRequest.chatId}`))
      .catch((err: Error) => console.error(`Error sending photo to ${currentRequest.chatId}. Error: ${err}`));
      break;
    case QrFormat.Svg:
      bot.sendDocument(
        currentRequest.chatId,
        fs.createReadStream(currentRequest.response),
        {
          caption: `QR image for request: ${currentRequest.text}`,
          reply_to_message_id: currentRequest.id
        }
      )
      .then(() => console.log(`SVG sent to ${currentRequest.chatId}`))
      .catch((err: Error) =>  console.error(`Error sending SVG to ${currentRequest.chatId}. Error: ${err}`));
      break;
    default:
      console.error(`Unsupported format: ${format}`);
      break;
  }
};

const handleChatChange = (currentChat: Chat, previousChat: Chat) => {
  const mode = currentChat.mode;
  switch (mode) {
    case ChatMode.Normal:
      bot.setMyCommands([
        { command: '/start', description: 'Show start message' },
        { command: '/help', description: 'Show help message' },
        { command: '/settings', description: 'Change settings' }
      ], { scope: { type: 'chat', chat_id: currentChat.id } })
          .catch((error) => {
            console.error('Error setting commands:', error);
          });
      break;
    case ChatMode.Settings:
      bot.setMyCommands([
        { command: '/set_png', description: 'Set QR code format to PNG' },
        { command: '/set_svg', description: 'Set QR code format to SVG' }
      ], { scope: { type: 'chat', chat_id: currentChat.id } })
        .then(() => {
          console.log(`Settings commands are now available for ${currentChat.id}`);
        })
        .catch((error) => {
          console.error(`Error setting commands: ${error}`);
        });
      break;
    default:
      console.log(`Unsupported mode in ${currentChat.id}`);
  }
};

const unsubscribe = store.subscribe(
  (state) => {
    const currentRequests = state.requests;
    handleNewRequests(currentRequests, previousRequests);

    currentRequests.forEach(currentRequest => {
      const previousRequest = previousRequests.find(req => req.id === currentRequest.id);
      if (previousRequest) {
        handleStateChange(currentRequest, previousRequest);
      }
    });

    previousRequests = currentRequests;

    const currentChats = state.chats;
    currentChats.forEach(currentChat => {
      const previousChat = previousChats.find(chat => chat.id === currentChat.id);
      if (previousChat) {
        handleChatChange(currentChat, previousChat);
      }
    })

    previousChats = currentChats;
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

